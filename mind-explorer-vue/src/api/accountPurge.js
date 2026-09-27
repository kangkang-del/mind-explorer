/**
 * accountPurge —— 「彻底删除账号」的客户端半边（批次 P）
 *
 * 一次调用做两件事，顺序不能反：
 *   ① **先删服务端**：调 content 的 account.purge（需持该身份的签名令牌）
 *   ② **再清本地**：只有服务端删成功了才清本地
 *
 * 为什么顺序不能反 —— 如果先清本地，令牌和身份就没了，服务端那一步永远发不出去，
 * 结果「本地看着像删干净了、云端数据一行没少」。这是不可逆操作里最危险的一种假成功。
 *
 * 本地清理采取「精确清单 + 前缀兜底」两条腿：
 *   · 精确清单：把已知的每个键名写死列出（改个变量名也不会漏删，因为有断言守着）
 *   · 前缀兜底：再扫一遍 `xm-` / `xiaomu_` 开头的键，防止将来新增键被遗忘
 *   · IndexedDB 用 deleteDatabase 整库删（比逐条 delete 干净，且能清掉 store 本身）
 */
import { FUNCTIONS_BASE, edgeHeaders } from '../config'

const ENDPOINT = `${FUNCTIONS_BASE}/content`
const FETCH_TIMEOUT = 20000

/** 皮肤图片 IndexedDB（与 useXiaomuSkin 的 DB_NAME 保持一致） */
const SKIN_DB = 'xm-skin-db'

/**
 * 已知的全部 localStorage 键 —— **这是清单，不是兜底**。
 *
 * ⚠️ 维护约束：**任何新增的 localStorage 键都必须加进这个数组**，
 *    并在后面标注它的来源文件。理由：前缀兜底（PREFIXES）只能抓住恰好
 *    以那几个前缀开头的键；若新键叫 `moodDraft` 这种不带前缀的名字，
 *    删除就会漏掉它 —— 而「删干净」的承诺不允许漏。
 *    校验：`verify-purge-local-p.mjs` 会断言清单与源码中出现的键一一对应。
 */
export const KNOWN_KEYS = [
  'xm-auth-token',        // api/xiaomuAuth.js
  'xm-quick-pending-v1',  // api/xiaomuAuth.js
  'xm-prefs-v1',          // useXiaomuPrefs.js
  'xm-unlocks-v1',        // useXiaomuWardrobe.js
  'xm-active-days',       // useXiaomuWardrobe.js
  'xiaomu_history_v1',    // views/Companion.vue
  'xiaomu_greeting_date', // views/Companion.vue
  'guest_info',           // stores/auth.js
  'cbt_records_v1',       // stores/badges.js
  'bedtime_done_v1',      // stores/badges.js
  'seen_badges_v1',       // stores/badges.js
  'trusted_contacts_v1',  // stores/trustedContacts.js（含真实联系人，必须删）
  'companion_guides_hint',
]

/** 兜底前缀 —— 只用来抓「清单漏了的新键」，不替代清单 */
const PREFIXES = ['xm-', 'xiaomu_', 'companion_guides', 'cbt_records', 'bedtime_done', 'seen_badges', 'trusted_contacts']

/** 清本地：localStorage + IndexedDB。返回清掉的键名数组（供断言/告知用户） */
export async function purgeLocal() {
  const removed = []

  // ① 精确清单
  for (const k of KNOWN_KEYS) {
    try {
      if (localStorage.getItem(k) !== null) {
        localStorage.removeItem(k)
        removed.push(k)
      }
    } catch { /* 隐私模式：忽略 */ }
  }

  // ② 前缀兜底（含动态键，如 xm-proactive-20260927）
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (!k) continue
      if (PREFIXES.some((p) => k.startsWith(p)) && !removed.includes(k)) {
        localStorage.removeItem(k)
        removed.push(k)
      }
    }
  } catch { /* 忽略 */ }

  // ③ IndexedDB 整库删（皮肤图片）
  await new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve()
      const req = indexedDB.deleteDatabase(SKIN_DB)
      req.onsuccess = () => resolve()
      // blocked：还有别的标签页开着这个库 —— 不能永远挂着，给个上限直接放行
      req.onblocked = () => setTimeout(resolve, 800)
      req.onerror = () => resolve()
    } catch { resolve() }
  })

  return removed
}

/**
 * 彻底删除账号。
 * @param {{userId:string, authToken:string, nickname:string, includeCommunity:boolean}} p
 * @returns {Promise<{ok:boolean, deleted?:object, failed?:string[], reason?:string, error?:string, localRemoved?:string[]}>}
 *          **永不抛** —— 失败一律以 {ok:false, reason} 返回，交给 UI 说人话
 */
export async function purgeAccount({ userId, authToken, nickname = '', includeCommunity = false } = {}) {
  if (!userId) return { ok: false, reason: 'no-identity' }
  if (!authToken) return { ok: false, reason: 'no-token' }

  let data
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: edgeHeaders(),
      body: JSON.stringify({
        action: 'account.purge',
        userId,
        authToken,
        nickname,
        includeCommunity: !!includeCommunity,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })
    data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        reason: res.status === 403 ? 'forbidden' : `http_${res.status}`,
        error: data?.error,
      }
    }
  } catch (e) {
    return { ok: false, reason: 'network', error: String((e && e.message) || e) }
  }

  // 服务端删成功 → 才清本地。clear 令牌放在这里（不是调用方），保证「删了就是删了」
  const localRemoved = await purgeLocal()
  return { ok: true, deleted: data.deleted || {}, failed: data.failed || [], localRemoved }
}
