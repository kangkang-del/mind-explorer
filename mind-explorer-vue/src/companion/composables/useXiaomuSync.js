/**
 * useXiaomuSync —— 小木跨设备同步引擎（M4 批次 N）
 *
 * 一句话：把「自定义形象 / 换装 / 衣柜解锁 / 累计使用天数」跟着账号同步，
 * 换设备（或换浏览器 profile）后自动恢复。未登录时全程静默不参与。
 *
 * ── 三条不变量（整个链路靠它们保持自洽）──────────────────────────
 *   ① **本地胜**：本地相对 base 改动过的字段，同步时覆盖远端（见 core/syncMerge.js）
 *   ② **成功后 local == base**：任何一次合并结果都会先写回本地，再推服务端。
 *      少了这一步会出现「本地是默认值、base 是远端值」→ 下次推送时
 *      changed(默认值, 远端值) 判为「本地改过」→ 用默认值把远端覆盖掉（实测踩过这个陷阱）
 *   ③ **不静默覆盖**：推送前带上手里的 version 做原子 CAS，不匹配就回 409，
 *      然后重拉 → 三方合并 → 重推一次；再失败就放弃本轮（下次挂载再来），绝不硬写
 *
 * ── 降级原则 ─────────────────────────────────────────────────
 * 未登录 / 拿不到令牌 / 后端没部署 / 断网 / 超限 —— 一律静默降级为「纯本地」，
 * 绝不影响桌宠本已可用的功能，也绝不阻塞 UI。
 */
import { nextTick, ref, watch } from 'vue'
import { useXiaomuPrefs } from './useXiaomuPrefs'
import { useXiaomuWardrobe } from './useXiaomuWardrobe'
import { useXiaomuSkin } from './useXiaomuSkin'
import { useIdentity } from '../../composables/useIdentity'
import { xmState } from '../../api/xiaomuState'
import { DEFAULT_SNAPSHOT, snapshotOf, normalizeRemote, mergeState, normSkin, changedPaths } from '../core/syncMerge'

const PUSH_DEBOUNCE_MS = 1200
const SKIN_MAX_BYTES = 1024 * 1024

let shared = null

export function useXiaomuSync() {
  if (shared) return shared

  const ident = useIdentity()
  const prefs = useXiaomuPrefs()
  const wardrobe = useXiaomuWardrobe()
  const skin = useXiaomuSkin()

  /** idle | pulling | syncing | ready | degraded | error */
  const phase = ref('idle')
  const degradeReason = ref('')
  const cloudNote = ref('')          // 给用户看的降级文案（图片超限等），正常时为空
  const lastSyncAt = ref(0)
  const remoteVersion = ref(0)
  const conflicts = ref(0)
  const hasSynced = ref(false)

  let base = clone(DEFAULT_SNAPSHOT)   // 上次与服务端达成一致的快照
  let lastRemote = null                // 最近一次拉到的远端快照
  let applying = false                 // 正在写回远端数据 → 期间的变更不该反弹成推送
  let pushing = false
  let pushTimer = null
  let disposed = false
  let halted = false                   // 批次 P：账号已删除 → 永久停手（不再拉、不再推）
  let inflightPull = null              // 并发/重复 init 的去重
  let syncedUid = ''                   // 已成功协商过的身份（同一身份重复 init 直接跳过）

  function clone(v) { return JSON.parse(JSON.stringify(v)) }

  /**
   * 屏蔽「内部写回」引发的推送反弹：这些改动是我们刚从云端拿下来的，
   * 再推回去既是无意义的往返，还会白撞一次版本号。
   */
  async function withoutBounce(fn) {
    applying = true
    try { await fn() } finally { await nextTick(); applying = false }
  }

  async function readLocal() {
    const s = wardrobe.status()
    return snapshotOf({
      prefs,
      unlocks: { items: s.unlocked, ms: s.milestones },
      activeDays: { days: s.activeDays, last: s.lastDay },
      skin: skin.meta.value,
    })
  }

  /** 把合并结果写回本地（不变量②）。writeBack 期间屏蔽推送反弹 */
  async function writeBack(merged) {
    await withoutBounce(() => {
      prefs.variant = merged.prefs.variant
      prefs.wear = { ...merged.prefs.wear }
      prefs.pos = merged.prefs.pos ?? null
      prefs.collapsed = !!merged.prefs.collapsed
      prefs.dnd = !!merged.prefs.dnd
      wardrobe.adoptUnlocks(merged.unlocks)
      wardrobe.adoptActiveDays(merged.activeDays)
    })
  }

  /** 形象图片是否需要上传：本地有图且（还没有云端路径 / 比上次一致时更新） */
  async function ensureSkinUploaded(uid, token) {
    const m = skin.meta.value
    if (!m || !m.at) return
    const baseAt = Number(base?.skin?.at) || 0
    if (m.path && Number(m.at) <= baseAt) return
    if ((Number(m.bytes) || 0) > SKIN_MAX_BYTES) {
      cloudNote.value = '图片超过 1MB，本次没有同步到云端（本机仍然可用）'
      return
    }
    const data = await skin.toDataURL()
    if (!data) return                       // 用签名 URL 兜底渲染时没有本地二进制，无需重传
    const res = await xmState.putSkin(uid, token, { data, type: m.type, w: m.w, h: m.h })
    if (res.ok && res.skin?.path) {
      // 写 path 会触发 skin watcher，必须屏蔽反弹（否则紧跟一次多余的状态推送）
      await withoutBounce(() => skin.setCloudPath(res.skin.path))
      cloudNote.value = ''
    } else if (res.reason === 'too-large') {
      cloudNote.value = '图片超过 1MB，没有同步到云端（本机仍然可用）'
    } else if (res.reason === 'network') {
      cloudNote.value = '网络不可用，形象图片暂时只存在这台设备上'
    } else if (res.reason === 'forbidden') {
      cloudNote.value = '登录状态已失效，形象图片暂时只存在这台设备上'
    } else {
      cloudNote.value = res.error || '形象图片同步失败（本机仍然可用）'
    }
  }

  /** 推送一个快照。snapshot 必须与推送后的本地状态一致（不变量②） */
  async function pushSnapshot(snapshot, version, uid, token) {
    const res = await xmState.put(uid, token, version, snapshot)
    if (res.ok) {
      remoteVersion.value = res.version
      base = clone(snapshot)
      lastRemote = clone(snapshot)
      lastSyncAt.value = Date.now()
      hasSynced.value = true
      phase.value = 'ready'
      degradeReason.value = ''
      return { ok: true, version: res.version }
    }
    return res
  }

  /** 冲突处理：重拉 → 三方合并（本地胜）→ 写回本地 → 带新版本重推一次 */
  async function resolveConflict(uid, token) {
    conflicts.value += 1
    const fresh = await xmState.get(uid, token)
    if (!fresh.ok) return { ok: false, reason: fresh.reason }
    remoteVersion.value = fresh.version
    if (!fresh.exists) {
      // 服务端行没了（被彻底删除）→ 按「首次创建」重来
      base = clone(DEFAULT_SNAPSHOT)
      lastRemote = null
      const local = await readLocal()
      return pushSnapshot(local, 0, uid, token)
    }
    lastRemote = normalizeRemote(fresh.payload)
    const remoteSkin = fresh.payload?.skin
    if (remoteSkin?.url) await skin.applyRemote(remoteSkin)
    const local = await readLocal()
    const merged = mergeState(base, local, lastRemote)   // ⚠️ base 仍取旧的 → 本地改过的字段仍胜出
    await writeBack(merged)
    return pushSnapshot(merged, fresh.version, uid, token)
  }

  /** 主动推送当前本地状态（本地改动触发） */
  async function pushNow() {
    if (disposed || halted || pushing) return { ok: false, reason: 'busy' }
    const uid = ident.userId.value
    if (!uid) return { ok: false, reason: 'no-identity' }
    const token = await ident.ensureToken()
    if (!token) { phase.value = 'degraded'; degradeReason.value = 'no-token'; return { ok: false, reason: 'no-token' } }

    pushing = true
    phase.value = 'syncing'
    try {
      await ensureSkinUploaded(uid, token)
      const local = await readLocal()
      let res = await pushSnapshot(local, remoteVersion.value, uid, token)

      if (!res.ok && res.conflict) {
        // ③ 不静默覆盖：重拉 → 三方合并（本地胜）→ 带新版本重推一次
        const again = await resolveConflict(uid, token)
        if (again.ok) {
          res = { ...again, retried: true }
        } else {
          phase.value = 'error'
          degradeReason.value = again.reason || 'conflict'
          res = { ok: false, reason: 'conflict-unresolved' }
        }
      } else if (!res.ok) {
        phase.value = res.reason === 'network' ? 'degraded' : 'error'
        degradeReason.value = res.reason || 'unknown'
      }

      // 收尾比对：本轮（含冲突合并）结束后本地仍有未同步的改动 → 补一次
      // （否则推送期间产生的改动会被 debounce 静默吞掉）。
      // ⚠️ 只在**本轮真正成功**时才补：失败/冲突分支自己会重新拉取+合并，
      //    那里已经读到最新本地状态；此时再排一次定时推送纯属重复写，
      //    还会让服务端版本平白 +1、引起对端设备无谓重拉（实测踩过）。
      if (res.ok) {
        const after = await readLocal()
        if (changedPaths(base, after).length) schedulePush(200)
      }
      return res
    } catch (e) {
      phase.value = 'error'
      degradeReason.value = String((e && e.message) || e)
      return { ok: false, reason: 'exception' }
    } finally {
      pushing = false
    }
  }

  /** 拉取 → 合并 → 写回 → 必要时回推（并发调用会合并为同一次） */
  async function pullAndReconcile() {
    if (disposed || halted) return { ok: false, reason: 'purged' }   // 批次 P：删完不再拉回任何东西
    if (inflightPull) return inflightPull
    inflightPull = doPull().finally(() => { inflightPull = null })
    return inflightPull
  }

  async function doPull() {
    const uid = ident.userId.value
    if (!uid) { phase.value = 'degraded'; degradeReason.value = 'no-identity'; return { ok: false, reason: 'no-identity' } }
    const token = await ident.ensureToken()
    if (!token) { phase.value = 'degraded'; degradeReason.value = 'no-token'; return { ok: false, reason: 'no-token' } }

    phase.value = 'pulling'
    const res = await xmState.get(uid, token)
    if (!res.ok) {
      phase.value = res.reason === 'network' ? 'degraded' : 'error'
      degradeReason.value = res.reason || 'unknown'
      return res
    }
    remoteVersion.value = res.version

    // 服务端还没有 → 保持 base 为默认快照，把本地推上去建立副本
    if (!res.exists) {
      base = clone(DEFAULT_SNAPSHOT)
      lastRemote = null
      hasSynced.value = true
      return pushNow()
    }

    lastRemote = normalizeRemote(res.payload)
    const remoteSkin = res.payload?.skin
    if (remoteSkin?.url) await skin.applyRemote(remoteSkin)

    const local = await readLocal()
    const merged = mergeState(base, local, lastRemote)
    await writeBack(merged)
    base = clone(merged)
    lastSyncAt.value = Date.now()
    hasSynced.value = true
    phase.value = 'ready'
    degradeReason.value = ''

    // 合并结果与远端不一致（本地有本地改动）→ 让服务端也收敛
    if (changedPaths(merged, lastRemote).length) return pushNow()
    return { ok: true, version: remoteVersion.value }
  }

  /** 入口：身份就绪后调用一次；身份变化时会自动重跑 */
  async function init() {
    if (disposed) return
    return pullAndReconcile()
  }

  /**
   * 清除云端形象图片（批次 N）：用户点「清除」时调用。
   * 顺序很重要：先删对象再推 payload，否则会出现「payload 指向一个已被删掉的对象」。
   * 只删图片，不动状态表的其它字段。
   */
  async function forgetSkin() {
    skin.meta.value = null
    cloudNote.value = ''
    const uid = ident.userId.value
    if (!uid) return { ok: true, skipped: 'no-identity' }
    const token = await ident.ensureToken()
    if (!token) return { ok: true, skipped: 'no-token' }
    const res = await xmState.clearSkin(uid, token)
    if (res.ok) await pushNow()
    return res
  }

  function schedulePush() {
    if (disposed || halted || applying || !hasSynced.value) return
    clearTimeout(pushTimer)
    pushTimer = setTimeout(() => { pushTimer = null; pushNow() }, PUSH_DEBOUNCE_MS)
  }

  /**
   * 批次 P：账号已彻底删除 → 同步引擎永久停手。
   *
   * 为什么必须有这个闸门 —— 删除成功后，`skin.clear()` 与身份归零会触发
   * 上面三个 watcher；若不停手，`pushNow()` 会在删除完成后又把一份空快照
   * 写回 `xiaomu_user_state`，等于「刚删掉的行立刻长回来」。
   * 这是「本地清了、云端又出现」的假成功，比删不掉更糟。
   *
   * 刻意**不可逆**（同 farewell 的语义）：删了就是删了，本次会话内不再同步。
   * 用户重新登录后是新的身份，届时页面刷新，本引擎重建。
   */
  function halt() {
    halted = true
    clearTimeout(pushTimer)
    pushTimer = null
    phase.value = 'idle'
    degradeReason.value = 'purged'
    hasSynced.value = false
  }

  /** 变更监听：外观 / 衣柜 / 形象图片 */
  watch(() => JSON.stringify(prefs), () => schedulePush())
  watch(
    () => {
      const s = wardrobe.status()
      return `${s.activeDays}|${s.unlocked.length}|${Object.keys(s.milestones).length}`
    },
    () => schedulePush(),
  )
  watch(
    () => {
      const m = skin.meta.value
      return m ? `${m.at || 0}|${m.path || ''}` : ''
    },
    () => schedulePush(),
  )

  /* ---- 身份变化（登录 / 升级 / 退出）→ 重置协商基准后重新拉取 ---- */
  watch(() => ident.userId.value, (uid, old) => {
    if (uid === old || disposed || halted) return   // 批次 P：已删除 → 身份归零也不重启同步
    base = clone(DEFAULT_SNAPSHOT)
    lastRemote = null
    remoteVersion.value = 0
    hasSynced.value = false
    conflicts.value = 0
    cloudNote.value = ''
    if (uid) init()
    else { phase.value = 'idle'; degradeReason.value = 'no-identity' }
  })

  shared = {
    phase,
    degradeReason,
    cloudNote,
    lastSyncAt,
    remoteVersion,
    conflicts,
    hasSynced,
    init,
    refresh: pullAndReconcile,
    pushNow,
    forgetSkin,
    halt,
    /** 验收/排查用：一次拿到全部同步状态 */
    debug: () => ({
      phase: phase.value,
      degrade: degradeReason.value,
      note: cloudNote.value,
      version: remoteVersion.value,
      conflicts: conflicts.value,
      synced: hasSynced.value,
      lastSyncAt: lastSyncAt.value,
    }),
    _internals: { readLocal, changedPaths, resolveConflict, normSkin },
  }
  return shared
}
