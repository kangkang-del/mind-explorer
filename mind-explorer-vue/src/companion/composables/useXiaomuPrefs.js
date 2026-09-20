/**
 * useXiaomuPrefs —— 小木本地偏好持久化（批次 B）
 *
 * 存 localStorage（键 xm-prefs-v1）：
 *   variant —— 形态 wood | dog | custom（M3 起为衣柜「皮肤」槽位；custom = 用户上传图片皮肤，批次 J）
 *   wear    —— 换装（M3 升级：{ hat, scarf, bow } 槽位→物品 id；旧布尔数据自动迁移）
 *   pos     —— 悬浮位置 { x, y }（px，拖拽后保存；null = 默认右下角）
 *   collapsed —— 收起态（任务 7 用，先占位）
 *   dnd     —— 免打扰（M2 批次 F：true = 主动搭话全静默）
 *
 * 读写全部 try/catch：隐私模式/禁存储时静默降级为不持久化。
 */
import { reactive, watch } from 'vue'

const KEY = 'xm-prefs-v1'

const defaults = () => ({
  variant: 'wood',
  wear: { hat: 'hat-none', scarf: 'scarf-none', bow: 'bow-none' },  // M3：槽位→物品 id
  pos: null,          // { x, y }
  collapsed: false,
  dnd: false,         // M2 批次 F：免打扰（true = 小木不主动搭话，被动聊天不受影响）
})

/** M3 迁移：旧版布尔（hat:true）→ 物品 id；新版字符串原样；缺失 → none */
function normWear(v, noneId, onId) {
  if (v === true) return onId
  if (typeof v === 'string') return v
  return noneId
}

/** 形态白名单：wood / dog / custom（custom 的图片是否存在由 useXiaomuSkin 判定，缺失时渲染层回落 wood） */
const VARIANTS = ['wood', 'dog', 'custom']

function load() {
  const base = defaults()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return base
    const saved = JSON.parse(raw)
    const w = saved.wear || {}
    return {
      variant: VARIANTS.includes(saved.variant) ? saved.variant : 'wood',
      wear: {
        hat: normWear(w.hat, 'hat-none', 'hat-beret'),
        scarf: normWear(w.scarf, 'scarf-none', 'scarf-red'),
        bow: normWear(w.bow, 'bow-none', 'bow-pink'),
      },
      pos: saved.pos && Number.isFinite(saved.pos.x) && Number.isFinite(saved.pos.y) ? saved.pos : null,
      collapsed: !!saved.collapsed,
      dnd: !!saved.dnd,
    }
  } catch {
    return base
  }
}

/**
 * 单例：全站共享同一个 prefs reactive。
 * ⚠️ 必须是单例——XiaomuPet（渲染）与 XiaomuWardrobe（换装/上传 UI）若各持一份副本，
 * 面板里的改动只会写进 localStorage、不会实时作用到形象上（要刷新才生效）。
 */
let shared = null

export function useXiaomuPrefs() {
  if (shared) return shared
  const prefs = reactive(load())

  let saveTimer = null
  // 合并防抖写盘（拖拽会高频触发）
  watch(
    () => JSON.stringify(prefs),
    () => {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        try { localStorage.setItem(KEY, JSON.stringify(prefs)) } catch { /* 静默 */ }
      }, 250)
    }
  )

  shared = prefs
  return shared
}
