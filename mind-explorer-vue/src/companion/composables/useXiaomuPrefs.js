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
 * M6-1 新增（语音播报）：
 *   voiceOn       —— 小木回复后是否读出声（D6：默认 false，用户可开）
 *   voiceURI      —— 选中的系统音色（'' = 自动挑一个中文音色）
 *   voiceRate     —— 语速（0.6~1.6，默认 1）
 *   voiceProactive—— 主动搭话时也出声（D6：默认 false）
 *
 * M6-2c 新增（语音输入）：
 *   iatOn         —— 是否开启「按住说话」（默认 false：纯加法，未开启者完全无感）
 *
 * M6-1b 新增（云端音色 · 用户自带 Key）：
 *   voiceEngine   —— 'system' | 'cloud'（默认 system：不配 Key 的人零感知）
 *   ttsTransport  —— 'local' | 'account'（Key 存本机 / 加密存账号；M6-1b 只实现 local）
 *   ttsBaseUrl    —— 兼容 OpenAI /audio/speech 的服务地址
 *   ttsModel      —— 默认 glm-tts
 *   ttsVoice      —— 默认 tongtong；自定义供应商时可自由填写，故**不做 7 项枚举限制**
 *
 * 🔴 **API Key 不在本对象里**，单独存 localStorage 键 `xm_tts_key`（见 utils/cloudTts.js）。
 *    理由：prefs 会被整体 JSON.stringify 写盘、会被诊断脚本 dump、也更容易被顺手 console.log
 *    —— Key 不进这个对象，就少三条泄露路径。
 *
 * 读写全部 try/catch：隐私模式/禁存储时静默降级为不持久化。
 */
import { reactive, watch } from 'vue'

const KEY = 'xm-prefs-v1'

// ---- M6-1b 云端音色的默认值与白名单 ----
/** 智谱兼容端点（拼 /audio/speech）。用户可改成任意 OpenAI 兼容服务 */
export const DEFAULT_TTS_BASE = 'https://open.bigmodel.cn/api/paas/v4'

const ENGINES = ['system', 'cloud']
const TRANSPORTS = ['local', 'account']

/**
 * 归一化兼容端点：必须能 new URL() 解析且是 https。
 * 🔴 localStorage 是**用户可改的**，当不可信输入处理 —— 否则 `javascript:` / `data:` 会被原样拿去 fetch。
 */
function normBaseUrl(v) {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!s || s.length > 200) return DEFAULT_TTS_BASE
  try {
    const u = new URL(s)
    if (u.protocol !== 'https:') return DEFAULT_TTS_BASE
    return (u.origin + u.pathname).replace(/\/+$/, '')
  } catch {
    return DEFAULT_TTS_BASE
  }
}

/** 模型 / 音色：自定义供应商可能是任意字符串，故只做「非空 + 长度 + 字符集」约束，不枚举 */
function normIdent(v, dflt) {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!s || s.length > 80) return dflt
  return /^[A-Za-z0-9._:-]+$/.test(s) ? s : dflt
}

const defaults = () => ({
  variant: 'wood',
  wear: { hat: 'hat-none', scarf: 'scarf-none', bow: 'bow-none' },  // M3：槽位→物品 id
  pos: null,          // { x, y }
  collapsed: false,
  dnd: false,         // M2 批次 F：免打扰（true = 小木不主动搭话，被动聊天不受影响）
  // ---- M6-1 语音 ----
  voiceOn: false,         // 播报开关
  voiceURI: '',           // 系统音色 voiceURI
  voiceRate: 1,           // 语速
  voiceProactive: false,  // 主动出声
  // ---- M6-2c 语音输入 ----
  iatOn: false,           // 「按住说话」开关（默认关：语音输入要占麦克风，必须用户显式打开）
  // ---- M6-1b 云端音色（自带 Key） ----
  voiceEngine: 'system',  // 'system' | 'cloud'
  ttsTransport: 'local',  // 'local' | 'account'
  ttsBaseUrl: DEFAULT_TTS_BASE,
  ttsModel: 'glm-tts',
  ttsVoice: 'tongtong',
})

/** M3 迁移：旧版布尔（hat:true）→ 物品 id；新版字符串原样；缺失 → none */
function normWear(v, noneId, onId) {
  if (v === true) return onId
  if (typeof v === 'string') return v
  return noneId
}

/** 形态白名单：wood / dog / custom（custom 的图片是否存在由 useXiaomuSkin 判定，缺失时渲染层回落 wood） */
const VARIANTS = ['wood', 'dog', 'custom']

/** 语速夹取：与播报层 useXiaomuVoice 的 clampRate 保持一致 */
function normRate(v) {
  if (!Number.isFinite(v)) return 1
  return Math.min(1.6, Math.max(0.6, v))
}

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
      // ---- M6-1 语音 ----
      voiceOn: !!saved.voiceOn,
      voiceURI: typeof saved.voiceURI === 'string' ? saved.voiceURI : '',
      voiceRate: normRate(saved.voiceRate),
      voiceProactive: !!saved.voiceProactive,
      // ---- M6-2c 语音输入 ----
      iatOn: !!saved.iatOn,
      // ---- M6-1b 云端音色 ----
      voiceEngine: ENGINES.includes(saved.voiceEngine) ? saved.voiceEngine : 'system',
      ttsTransport: TRANSPORTS.includes(saved.ttsTransport) ? saved.ttsTransport : 'local',
      ttsBaseUrl: normBaseUrl(saved.ttsBaseUrl),
      ttsModel: normIdent(saved.ttsModel, 'glm-tts'),
      ttsVoice: normIdent(saved.ttsVoice, 'tongtong'),
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
