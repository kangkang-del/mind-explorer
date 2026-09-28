// ============================================================
// M5 自定义模型 · 用户 API Key 加解密（AES-GCM 256）
// ------------------------------------------------------------
// 用途：用户在自己设置面板填的 LLM API Key，必须「加密后」才落库
//       （xiaomu_model_config.key_cipher）。要调 LLM 时再取回明文。
//
// 为什么不用 auth.js 的 HMAC？
//   HMAC 是单向的、只用于「证明身份」；API Key 必须能取回原文去调用，
//   所以需要**加密**而非哈希 —— 这是两件不同的事，不能复用同一套。
//
// 密钥来源：Edge Secret `KEY_ENC_SECRET`（任意长度）
//   密钥 = SHA-256(KEY_ENC_SECRET)  → 定长 32 字节，符合 AES-256 要求
//
// 密文格式：base64( iv(12B) ‖ ciphertext ‖ tag(16B) )
//   - IV 拼在密文头部，不单独建列（少一列、少一处出错可能）
//   - IV 每行独立随机（12 字节），绝不复用
//
// 关键设计：AAD 绑定 user_identifier
//   加密时把 uid 作为 additionalData 传入。这样即使密文被搬到别人的行里
//   （DBA 误操作 / 数据导入出错），解密也会失败 —— 堵住「B 用 A 的 Key」。
//
// 未配置 KEY_ENC_SECRET 时：本模块整体「关闭」（cryptoEnabled() === false），
//   与 auth.js 的 HMAC_SECRET 同样哲学 —— 可安全地先部署代码、后配密钥。
// ============================================================

const SECRET = Deno.env.get('KEY_ENC_SECRET') ?? ''

const IV_BYTES = 12            // AES-GCM 标准 96-bit nonce
const TAG_BYTES = 16           // GCM 认证标签长度
const MIN_CIPHER_BYTES = IV_BYTES + TAG_BYTES

/** 加密功能是否已启用（未配 KEY_ENC_SECRET → false，调用方应视为「功能关闭」） */
export const cryptoEnabled = () => !!SECRET

/** 派生 AES-256 密钥：SHA-256(secret) → 32 字节。缓存，避免每次调用都算。 */
let _keyCache = null
async function aesKey() {
  if (!SECRET) throw new Error('未配置 KEY_ENC_SECRET，加密功能不可用')
  if (_keyCache) return _keyCache
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SECRET))
  _keyCache = await crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  return _keyCache
}

// ---------- base64 工具（零依赖，兼容 Deno 与浏览器语义） ----------

function bytesToB64(bytes) {
  let s = ''
  const CHUNK = 0x8000 // 分块防 apply 参数上限（大字符串会栈溢出）
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(s)
}

function b64ToBytes(b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// ---------- 对外接口 ----------

/**
 * 加密用户 API Key。
 * @param {string} plain     明文 Key（调用方已做过长度校验）
 * @param {string} uid       user_identifier，作为 AAD 绑定
 * @returns {Promise<string>} base64(iv ‖ ciphertext ‖ tag)
 */
export async function encryptSecret(plain, uid) {
  if (typeof plain !== 'string' || !plain) throw new Error('待加密内容为空')
  const aad = new TextEncoder().encode(String(uid ?? ''))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad, tagLength: TAG_BYTES * 8 },
    await aesKey(),
    new TextEncoder().encode(plain),
  )
  // GCM 输出已含 tag 在尾部；直接 iv ‖ (cipher+tag)
  const ctBytes = new Uint8Array(ct)
  const buf = new Uint8Array(IV_BYTES + ctBytes.length)
  buf.set(iv, 0)
  buf.set(ctBytes, IV_BYTES)
  return bytesToB64(buf)
}

/**
 * 解密。任何异常（密钥错 / 密文被改 / AAD 不匹配）一律抛错，
 * 调用方应捕获后「回落站点默认模型」，绝不让对话报错。
 * @param {string} cipherB64
 * @param {string} uid       必须与加密时的 uid 完全一致
 * @returns {Promise<string>} 明文 Key
 */
export async function decryptSecret(cipherB64, uid) {
  if (typeof cipherB64 !== 'string' || !cipherB64) throw new Error('密文为空')
  let buf
  try {
    buf = b64ToBytes(cipherB64)
  } catch {
    throw new Error('密文不是有效的 base64')
  }
  if (buf.length < MIN_CIPHER_BYTES) throw new Error('密文长度不足')
  const iv = buf.subarray(0, IV_BYTES)
  const ct = buf.subarray(IV_BYTES)
  const aad = new TextEncoder().encode(String(uid ?? ''))
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aad, tagLength: TAG_BYTES * 8 },
      await aesKey(),
      ct,
    )
    return new TextDecoder().decode(pt)
  } catch {
    // 不区分「密钥错」与「数据被篡改」—— 二者对调用方是同一处置（回落默认）
    throw new Error('解密失败（密钥不匹配或数据已损坏）')
  }
}

/**
 * 生成用于前端回显的掩码 —— 绝不含完整 Key。
 * 形如 `sk-abcd...wxyz (len=51)`；短 Key 只留首尾各 2 字符。
 * @param {string} plain
 */
export function maskSecret(plain) {
  const s = String(plain ?? '')
  if (!s) return ''
  if (s.length <= 8) return `${'*'.repeat(s.length)} (len=${s.length})`
  return `${s.slice(0, 6)}...${s.slice(-4)} (len=${s.length})`
}
