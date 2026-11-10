/**
 * sceneStream —— 把流式增量切成「话」和「代码」两路（纯函数，无副作用、可单测）
 *
 * 为什么需要它：
 *   小木有时会在一条回复里既说话又画东西。代码块必须从气泡文字里剔掉，
 *   否则用户会看到一行行 HTML 往下滚。
 *
 * 🔴 关键教训（2026-11-10 实测，n=10）：
 *   她经常**不写代码围栏**（3/10），说完两句安慰直接开始写 `<div><canvas>…`。
 *   如果只认 ```，这些代码会整段糊进对话气泡 —— 用户眼里就是「小木突然发代码」。
 *   所以必须有「行首标签」兜底判定。
 *
 * 设计取舍：
 *   不复用增量状态机，而是每个 chunk 到达后对全量 raw 重新求值。
 *   回复长度上限只有十几 KB，重算的代价远小于状态机算错的代价。
 */

/** 单张卡片代码体积上限，超过就不渲染（与后端提示词约束一致） */
export const SCENE_MAX_BYTES = 12000

const FENCE = '```'
/** 只要出现这几个标签，基本可以确定进入代码段 */
const CODE_TAG = /<(style|canvas|svg|script)[\s>]/i
/** 行首的 `<`，用来找代码段起点 */
const LINE_START_LT = /(^|\n)</g
/** 正文里混进来的 HTML 标签（实测出现过 <br>） */
const STRAY_TAG = /<\/?(br|div|p|span|style|canvas|svg|script|html|head|body)\b[^<>\n]{0,80}>/gi

/** 把正文里混进来的标签去掉。聊天气泡里不该出现 <br> 这种东西 */
function cleanText(s) {
  // 尾部空白也要去掉：代码块前面通常有空行，留着会在气泡底部撑出一条空白
  return s.replace(STRAY_TAG, '').replace(/\s+$/, '')
}

/**
 * 在无围栏的情况下，找代码段起点。
 * @returns {{idx:number, confirmed:boolean}} confirmed=false 表示「像是代码但还没看够」
 */
function scanNoFence(raw, final) {
  LINE_START_LT.lastIndex = 0
  let m
  while ((m = LINE_START_LT.exec(raw))) {
    const idx = m.index + m[1].length
    const win = raw.slice(idx, idx + 400)
    if (CODE_TAG.test(win)) return { idx, confirmed: true }
    // 窗口还不够长、且流没结束 → 先按住这一段，别急着当正文输出
    if (!final && win.length < 400) return { idx, confirmed: false }
  }
  return { idx: -1, confirmed: false }
}

/**
 * 从全量 raw 求出当前状态。
 * @returns {{text:string, code:string, closed:boolean, noFence:boolean, mode:string}}
 */
function derive(raw, final) {
  const fenceIdx = raw.indexOf(FENCE)

  if (fenceIdx >= 0) {
    const head = raw.slice(0, fenceIdx)
    const rest = raw.slice(fenceIdx + FENCE.length)
    const nl = rest.indexOf('\n')

    // 语言标记还没写完（```htm），先不切
    if (nl < 0) {
      return { text: cleanText(head), code: '', closed: false, noFence: false, mode: 'fence' }
    }

    const body = rest.slice(nl + 1)
    const closeIdx = body.indexOf(FENCE)
    if (closeIdx >= 0) {
      const tail = body.slice(closeIdx + FENCE.length)
      return {
        text: cleanText(head + tail),
        code: body.slice(0, closeIdx),
        closed: true,
        noFence: false,
        mode: 'fence',
      }
    }
    return { text: cleanText(head), code: body, closed: false, noFence: false, mode: 'fence' }
  }

  // ---- 无围栏兜底 ----
  const scan = scanNoFence(raw, final)
  if (scan.confirmed) {
    return {
      text: cleanText(raw.slice(0, scan.idx)),
      code: raw.slice(scan.idx),
      closed: false,
      noFence: true,
      mode: 'tag',
    }
  }
  if (!scan.confirmed && scan.idx >= 0 && !final) {
    // 从疑似代码起点起按住，正文只出到那里
    return { text: cleanText(raw.slice(0, scan.idx)), code: '', closed: false, noFence: false, mode: 'hold' }
  }

  // ---- 纯正文 ----
  // 反引号被拆帧：结尾挂着的 1~2 个反引号先按住，否则会闪一下 ``
  let cut = raw.length
  if (!final) {
    const tailTicks = raw.match(/`{1,2}$/)
    if (tailTicks) cut = raw.length - tailTicks[0].length
  }
  return { text: cleanText(raw.slice(0, cut)), code: '', closed: false, noFence: false, mode: 'text' }
}

/**
 * 创建一个流式切分器。
 * 用法：
 *   const st = createSceneStream()
 *   st.push(chunk)  → 返回当前状态 { text, code, closed, noFence, mode, overflow }
 *   st.finish()     → 流结束，放行被按住的部分
 */
export function createSceneStream(options = {}) {
  const maxBytes = Number(options.maxBytes) || SCENE_MAX_BYTES
  let raw = ''
  let state = derive('', false)

  function recompute(final) {
    state = derive(raw, final)
    // 代码超限：不截断、只标记，交由渲染层决定是否放弃
    state.overflow = state.code.length > maxBytes
    return state
  }

  return {
    push(chunk) {
      raw += String(chunk == null ? '' : chunk)
      return recompute(false)
    },
    finish() {
      return recompute(true)
    },
    /** 仅测试与调试用 */
    get raw() {
      return raw
    },
    get state() {
      return state
    },
  }
}

/**
 * 给已有完整文本做一次切分（用于历史恢复、非流式回复）。
 */
export function splitOnce(raw) {
  const st = derive(String(raw || ''), true)
  st.overflow = st.code.length > SCENE_MAX_BYTES
  return st
}
