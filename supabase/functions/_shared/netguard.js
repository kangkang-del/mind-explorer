// ============================================================
// M5 自定义模型 · endpoint 安全校验（SSRF 防护 + L6 策略白名单）
// ------------------------------------------------------------
// 用途：用户可填自己的 LLM endpoint（Ollama / 任何 OpenAI 兼容服务）。
//       若不校验，攻击者可把 endpoint 指向内网服务，让我们的 Edge 函数
//       替他探测内网（Server-Side Request Forgery）。
//
// ⚠️ 本模块只能做「字面量 / 后缀」层面的静态过滤。
//    Deno Edge 环境无法「先解析域名拿 IP → 校验 → 保证连的是同一个 IP」，
//    所以挡不住精心构造的 DNS rebinding。这是**已知残余风险**，
//    已登记 M4-遗留问题清单 §六之二（W6）。
//    缓解：L6 端口白名单把攻击面从「整个内网」塌缩到「443 上跑 https 的服务」。
//
// 两层职责：
//   L1  SSRF 静态过滤  —— 协议 / 内网字面量 / IP 变体 / 内网后缀
//   L6  策略白名单     —— 端口仅 443
//
// 📌 L6 变更记录（2026-09-28 经用户裁决，详见 M5-任务清单 §13）
//   原 L6 还含以下两条，**已移除**：
//     · 自家平台域名黑名单 —— D12 已强制用户自带 Key，「借道打自家接口白嫖站点 Key」
//       的路径在 D12 处就断了；残余安全价值≈0，却把 zhipu / deepseek / openai
//       三个预置平台的**用户自带 Key 正当使用**一并拦下（最高频场景）。
//     · 路径仅 /v1         —— SSRF 风险点在**主机**不在路径，路径白名单安全收益极低，
//       却拦住智谱真实的 OpenAI 兼容路径 /api/paas/v4（以及 Ollama 的裸域名形态）。
//   保留以下两条：
//     · 端口仅 443         —— 把 DNS rebinding 残余风险从「整个内网」塌缩到
//       「443 上跑的 https 服务」（W6 登记的缓解措施，见 M4-遗留问题清单 §六之二）
//     · SSRF 静态过滤      —— 挡掉绝大多数脚本小子
// ============================================================

const BAD_PROTOCOLS = ['file:', 'gopher:', 'ftp:', 'ftps:', 'data:', 'blob:', 'about:', 'chrome:']

const INTERNAL_SUFFIXES = ['.local', '.localhost', '.internal', '.lan', '.home', '.corp', '.intranet']

const MAX_URL_LEN = 200

// ---------- 内网 IP 判定 ----------

/** 判断 IPv4 四段点分十进制是否落在内网/保留段 */
function isPrivateIPv4(a, b) {
  if (a === 0) return true                        // 0.0.0.0/8
  if (a === 127) return true                      // 127.0.0.0/8  回环
  if (a === 10) return true                       // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true         // 192.168.0.0/16
  if (a === 169 && b === 254) return true         // 169.254.0.0/16（含云元数据 169.254.169.254）
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
  return false
}

/** 把十进制/八进制/十六进制整数形式的 IP 还原成点分（如 2130706433 → 127.0.0.1） */
function expandNumericHost(host) {
  let n = null
  if (/^\d{1,10}$/.test(host)) {
    n = Number(host)
  } else if (/^0x[0-9a-f]{1,8}$/i.test(host)) {
    n = parseInt(host, 16)
  } else if (/^0[0-7]{1,11}$/.test(host)) {
    n = parseInt(host, 8)
  }
  if (n === null || !Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) return null
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

/**
 * 主机字面量是否指向内网。
 * 覆盖：点分 IPv4 / 十进制·八进制·十六进制整数 / IPv6 字面量 / 内网后缀主机名
 */
function isInternalHost(hostRaw) {
  const host = String(hostRaw || '').toLowerCase().replace(/^\[|\]$/g, '') // 去 IPv6 方括号
  if (!host) return true

  // 主机名内网后缀
  if (INTERNAL_SUFFIXES.some((s) => host === s.slice(1) || host.endsWith(s))) return true
  if (host === 'localhost') return true

  // IPv6 字面量（含 ::1 / fc00::/7 / fe80::/10 / ::ffff:127.x）
  if (host.includes(':')) {
    if (host === '::1' || host === '::') return true
    if (/^f[cd][0-9a-f]{2}:/.test(host)) return true   // fc00::/7（ULA）
    if (/^fe[89ab][0-9a-f]:/.test(host)) return true   // fe80::/10（链路本地）
    // IPv4-mapped ::ffff:a.b.c.d
    const m = /^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
    if (m) return isPrivateIPv4(Number(m[1]), Number(m[2]))
    // ::ffff:7f00:1 之类的十六进制映射形式
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(host)) {
      const parts = host.slice(7).split(':')
      const hi = parseInt(parts[0], 16)
      if (Number.isFinite(hi)) return isPrivateIPv4((hi >> 8) & 255, hi & 255)
    }
    return false
  }

  // 数字形式的 IP 变体（十进制 / 八进制 / 十六进制）
  if (/^(\d+|0x[0-9a-f]+)$/i.test(host)) {
    const dotted = expandNumericHost(host)
    if (!dotted) return true // 解析不出但看起来是数字 → 一律拒绝
    const [a, b] = dotted.split('.').map(Number)
    return isPrivateIPv4(a, b)
  }

  // 标准点分 IPv4
  const m4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (m4) {
    const segs = m4.slice(1).map(Number)
    if (segs.some((x) => x > 255)) return true
    return isPrivateIPv4(segs[0], segs[1])
  }

  return false
}

// ---------- 对外接口 ----------

/**
 * 校验用户填的 endpoint 是否允许使用。
 * @param {string} rawUrl
 * @returns {{ ok: boolean, reason?: string, url?: URL }}
 */
export function assertSafeEndpoint(rawUrl) {
  const s = String(rawUrl ?? '').trim()
  if (!s) return { ok: false, reason: 'endpoint 不能为空' }
  if (s.length > MAX_URL_LEN) return { ok: false, reason: `endpoint 过长（>${MAX_URL_LEN} 字符）` }

  // 协议黑名单（先于 URL 解析，挡 file:/gopher: 这类 URL 解析器可能不报错的）
  const lower = s.toLowerCase()
  if (BAD_PROTOCOLS.some((p) => lower.startsWith(p))) {
    return { ok: false, reason: '不支持的协议' }
  }

  let u
  try {
    u = new URL(s)
  } catch {
    return { ok: false, reason: 'endpoint 不是合法的 URL' }
  }

  // --- L1 协议：仅 https ---
  if (u.protocol !== 'https:') return { ok: false, reason: 'endpoint 必须使用 https' }

  // --- L1 主机内网判定 ---
  if (isInternalHost(u.hostname)) return { ok: false, reason: '不允许指向本机或内网地址' }

  // --- L6 端口白名单：仅 443（显式省略等同于默认 443） ---
  // 注：原「自家平台域名黑名单」与「路径仅 /v1」两条已于 2026-09-28 按裁决移除，
  //     变更理由见文件头「L6 变更记录」。
  if (u.port && u.port !== '443') {
    return { ok: false, reason: 'endpoint 仅允许 443 端口' }
  }

  // 拒绝带用户名密码的 URL（凭据应走 Key 字段，不藏在 URL 里）
  if (u.username || u.password) return { ok: false, reason: 'endpoint 不应包含账号密码' }

  return { ok: true, url: u }
}

/**
 * 归一化 endpoint：去掉尾部斜杠，便于落库与比对。
 */
export function normalizeEndpoint(rawUrl) {
  const s = String(rawUrl ?? '').trim()
  if (!s) return ''
  try {
    return new URL(s).origin + new URL(s).pathname.replace(/\/+$/, '')
  } catch {
    return s.replace(/\/+$/, '')
  }
}

export const _internals = { isInternalHost, expandNumericHost, isPrivateIPv4 }
