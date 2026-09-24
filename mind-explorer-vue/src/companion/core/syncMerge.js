/**
 * 小木跨设备同步 · 纯函数（批次 N）
 *
 * 这里刻意不 import 任何 Vue/DOM —— 合并与冲突策略是整个同步链路最容易出错、
 * 也最难在浏览器里观察的部分，抽成纯函数就能在 Node 里穷举各种三方状态直接断言。
 *
 * 三方合并（three-way merge）：
 *   base   —— 上一次「本地与服务端达成一致」的快照（首轮为 DEFAULT_SNAPSHOT）
 *   local  —— 此刻本地真实状态
 *   remote —— 服务端最新快照
 *
 * 规则总纲：**本地相对 base 改动过的字段 → 本地胜；没动过的 → 以远端为准。**
 * 这条总纲同时解决了两种截然不同的处境：
 *   · 全新设备（本地全默认 = 没动过）→ 远端整体覆盖本地 → 自动恢复 ✓
 *   · 老设备带着自己玩出来的数据首次登录 → 只有它真碰过的槽位胜出 ✓
 * 少数几个字段不看「改没改」，而用更符合语义的合并律（见各自注释）。
 */

const WEAR_SLOTS = ['hat', 'scarf', 'bow']
const PREF_SCALARS = ['variant', 'collapsed', 'dnd', 'pos']

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** JSON 级比较：这些值都很小，直接序列化比较最省事也最不容易漏 */
const changed = (a, b) => JSON.stringify(a) !== JSON.stringify(b)

export const DEFAULT_SNAPSHOT = Object.freeze({
  prefs: {
    variant: 'wood',
    wear: { hat: 'hat-none', scarf: 'scarf-none', bow: 'bow-none' },
    pos: null,
    collapsed: false,
    dnd: false,
  },
  unlocks: { items: [], ms: {} },
  activeDays: { days: 0, last: '' },
  skin: null,
})

/** 皮肤元数据的规范形态：**必须剔除 url**（签名 URL 每次都不同，留着会让「有没有变化」永远判为真） */
export function normSkin(meta) {
  if (!meta || !meta.path) return null
  return {
    path: String(meta.path),
    w: num(meta.w),
    h: num(meta.h),
    type: String(meta.type || ''),
    at: num(meta.at),
  }
}

/** 从本地各模块的实时状态构造快照 */
export function snapshotOf({ prefs, unlocks, activeDays, skin } = {}) {
  return {
    prefs: {
      variant: prefs?.variant ?? DEFAULT_SNAPSHOT.prefs.variant,
      wear: {
        hat: prefs?.wear?.hat ?? DEFAULT_SNAPSHOT.prefs.wear.hat,
        scarf: prefs?.wear?.scarf ?? DEFAULT_SNAPSHOT.prefs.wear.scarf,
        bow: prefs?.wear?.bow ?? DEFAULT_SNAPSHOT.prefs.wear.bow,
      },
      pos: prefs?.pos ?? null,
      collapsed: !!prefs?.collapsed,
      dnd: !!prefs?.dnd,
    },
    unlocks: {
      items: Array.isArray(unlocks?.items) ? [...unlocks.items] : [],
      ms: unlocks?.ms && typeof unlocks.ms === 'object' ? { ...unlocks.ms } : {},
    },
    activeDays: {
      days: num(activeDays?.days),
      last: typeof activeDays?.last === 'string' ? activeDays.last : '',
    },
    skin: normSkin(skin),
  }
}

/** 远端 payload（可能含 url / 脏字段）→ 规范快照 */
export function normalizeRemote(payload) {
  const p = payload && typeof payload === 'object' ? payload : {}
  return snapshotOf({
    prefs: p.prefs,
    unlocks: p.unlocks,
    activeDays: p.activeDays,
    skin: p.skin,
  })
}

/** 逐字段比较用的路径表（顺序稳定，便于差分与测试） */
const CMP_PATHS = [
  'prefs.variant',
  'prefs.wear.hat',
  'prefs.wear.scarf',
  'prefs.wear.bow',
  'prefs.pos',
  'prefs.collapsed',
  'prefs.dnd',
  'unlocks.items',
  'unlocks.ms',
  'activeDays.days',
  'activeDays.last',
  'skin',
]

const at = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)

/** 两个快照之间「实际不同的字段」列表（空数组 = 完全一致） */
export function changedPaths(a, b) {
  const out = []
  for (const p of CMP_PATHS) {
    if (JSON.stringify(at(a, p)) !== JSON.stringify(at(b, p))) out.push(p)
  }
  return out
}

function mergePrefs(base, local, remote) {
  const b = base?.prefs || {}
  const l = local?.prefs || {}
  const r = remote?.prefs || {}
  const out = { ...r }
  for (const k of PREF_SCALARS) {
    if (changed(l[k], b[k])) out[k] = l[k]        // 本地改过 → 本地胜
    else if (r[k] === undefined) out[k] = l[k]    // 远端没有 → 保留本地（否则会凭空丢字段）
  }
  const wear = { ...(r.wear || {}) }
  for (const slot of WEAR_SLOTS) {
    if (changed(l.wear?.[slot], b.wear?.[slot])) wear[slot] = l.wear[slot]
    else if (wear[slot] === undefined) wear[slot] = l.wear?.[slot]
  }
  // 清掉 undefined，保证空值不会序列化成 null 混进远端
  for (const k of Object.keys(wear)) if (wear[k] === undefined) delete wear[k]
  out.wear = wear
  return out
}

/**
 * 解锁记录：**并集**，不看谁改过。
 * 理由：解锁是单向事件（达成过就不该失去）。若按「本地胜」，老设备会把新设备
 * 辛苦解锁的物品全抹掉；若按「远端胜」，反向也一样。并集是唯一不丢数据的规则。
 * 里程碑时间戳取更早的那个（第一次达成的时间才是真的）。
 */
function mergeUnlocks(base, local, remote) {
  const items = [...new Set([...(remote?.unlocks?.items || []), ...(local?.unlocks?.items || [])])]
  const ms = { ...(remote?.unlocks?.ms || {}) }
  for (const [k, v] of Object.entries(local?.unlocks?.ms || {})) {
    const t = num(v)
    if (!Number.isFinite(t)) continue
    ms[k] = ms[k] === undefined ? t : Math.min(num(ms[k]), t)
  }
  return { items, ms }
}

/** 累计使用天数：**取大**。同步不该让「用了 30 天」缩回 3 天 */
function mergeActiveDays(base, local, remote) {
  const days = Math.max(num(remote?.activeDays?.days), num(local?.activeDays?.days))
  const rl = typeof remote?.activeDays?.last === 'string' ? remote.activeDays.last : ''
  const ll = typeof local?.activeDays?.last === 'string' ? local.activeDays.last : ''
  return { days, last: rl > ll ? rl : ll }   // 'YYYYMMDD' 定点格式，字符串比较即日期比较
}

/** 皮肤：本地刚换过（相对 base 变了）→ 本地胜；否则谁新（at 大）用谁 */
function mergeSkin(base, local, remote) {
  const l = normSkin(local?.skin)
  const r = normSkin(remote?.skin)
  if (!r) return l
  if (!l) return r
  if (changed(local?.skin, base?.skin)) return l
  return num(l.at) >= num(r.at) ? l : r
}

/**
 * 三方合并主函数。
 * @returns 规范快照（可直接作为 state.put 的 payload）
 */
export function mergeState(base, local, remote) {
  return {
    prefs: mergePrefs(base, local, remote),
    unlocks: mergeUnlocks(base, local, remote),
    activeDays: mergeActiveDays(base, local, remote),
    skin: mergeSkin(base, local, remote),
  }
}
