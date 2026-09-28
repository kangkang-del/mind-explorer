/**
 * PCM 16kHz / 16-bit / 单声道 转换核心（M6-2a）
 *
 * 讯飞语音听写（IAT）对音频有硬性要求：**16k（或 8k）+ 16bit + 单声道**，
 * 且**不认 webm**（只收 pcm / wav / speex / mp3）—— 所以不能直接用
 * `MediaRecorder`（它产出 webm/opus），必须自己采、自己转。
 *
 * 为什么这个文件放在 `public/worklets/` 下，而不是 `src/`：
 *   1. `pcm-capture.js`（AudioWorkletProcessor）要 `import` 它。worklet 脚本按
 *      **module script** 加载，所以 import 可用；但 import 的 URL 相对于 worklet 自身，
 *      因此两者必须是**同目录的静态文件**。放 `public/` 下 → dev 与 `vite build` 后
 *      路径完全一致（`/worklets/…`）。
 *   2. 它同时是**纯函数 / 纯类、零 DOM 依赖** → Node 可以直接 import 做单元测试
 *      （见 `.workbuddy/js/verify-pcm16.mjs`）。**一份真源，两处消费**。
 *
 * 采样率无关：48k（大多数设备）与 44.1k（部分设备）走同一套线性插值。
 */

/** 目标采样率。讯飞只收 16k/8k；16k 也是**最大公约数**（智谱 ASR 同样吃 16k PCM） */
export const TARGET_RATE = 16000

/**
 * Float32 [-1, 1] → Int16（对称裁剪：−1 → −32768，+1 → 32767）
 * 用两个不同系数是为了避免 +1 时 round(32768) 溢出回绕成 −32768。
 */
export function floatToInt16(x) {
  const v = x < -1 ? -1 : x > 1 ? 1 : x
  return v < 0 ? Math.round(v * 32768) : Math.round(v * 32767)
}

/**
 * Int16 序列 → **小端**字节流。
 * 显式用 DataView 而不是直接拿 Int16Array 的 .buffer —— 不依赖运行平台字节序，
 * 讯飞要求小端，这里写错就是「安静的乱码」，宁可多一层也要写死。
 * @param {Int16Array|number[]} ints
 * @returns {Uint8Array}
 */
export function int16ToLeBytes(ints) {
  const n = ints.length
  const dv = new DataView(new ArrayBuffer(n * 2))
  for (let i = 0; i < n; i++) dv.setInt16(i * 2, ints[i], true)
  return new Uint8Array(dv.buffer)
}

/** 小端字节流 → Int16（验证 / 回放用；与 int16ToLeBytes 互逆） */
export function leBytesToInt16(bytes) {
  const n = bytes.length >> 1
  const out = new Int16Array(n)
  const dv = new DataView(bytes.buffer, bytes.byteOffset, n * 2)
  for (let i = 0; i < n; i++) out[i] = dv.getInt16(i * 2, true)
  return out
}

/**
 * 归一化 RMS（0..1）—— 驱动「波形随音量实时起伏」（M6-任务清单 §4.4）
 * @param {Float32Array|number[]} block
 */
export function rms(block) {
  const n = (block && block.length) || 0
  if (!n) return 0
  let s = 0
  for (let i = 0; i < n; i++) s += block[i] * block[i]
  return Math.min(1, Math.sqrt(s / n))
}

/**
 * 一次性线性插值降采样（无状态）。分块场景请用 `Pcm16Downsampler`。
 * @param {Float32Array|number[]} input
 * @param {number} inRate
 * @param {number} outRate
 * @returns {Float32Array}
 */
export function downsampleLinear(input, inRate, outRate = TARGET_RATE) {
  const ratio = inRate / outRate
  const n = input.length
  if (n < 2) return new Float32Array(0)
  const outLen = Math.floor((n - 1) / ratio) + 1
  const out = new Float32Array(outLen)
  for (let k = 0; k < outLen; k++) {
    const t = k * ratio
    const i = Math.floor(t)
    const f = t - i
    out[k] = f === 0 ? input[i] : input[i] + (input[i + 1] - input[i]) * f
  }
  return out
}

/**
 * 分块降采样器 —— AudioWorklet 每 128 帧回调一次，而 128 @48k = 2.667 个 16k 样本，
 * **不是整数**，所以必须跨块保留尾巴做插值，否则会累积漂移、时长越跑越偏。
 *
 * 用法：每块 `push(block)` 拿本块产出的 Int16（可能为空）；结束时 `flush()`。
 */
export class Pcm16Downsampler {
  /**
   * @param {number} inRate 输入采样率（AudioContext.sampleRate，通常 48000）
   * @param {number} [outRate]
   */
  constructor(inRate, outRate = TARGET_RATE) {
    this.inRate = inRate
    this.outRate = outRate
    this.ratio = inRate / outRate
    this._tail = new Float32Array(0)  // 上一块最后 1 个样本（线性插值的左端点）
    this._t = 0                       // 下一个输出样本在「tail + block」中的位置（可为小数）
    this.outCount = 0                 // 累计产出的 16k 样本数（自检用）
  }

  /**
   * @param {Float32Array|number[]} block
   * @returns {Int16Array} 本块产出的 16k Int16（可能长度为 0）
   */
  push(block) {
    const n = (block && block.length) || 0
    const buf = new Float32Array(this._tail.length + n)
    buf.set(this._tail, 0)
    if (n) buf.set(block, this._tail.length)
    const len = buf.length

    if (len < 2) { this._tail = buf; return new Int16Array(0) }

    const out = []
    let t = this._t
    // 需要 t 与 t+1 都落在缓冲内
    while (t + 1 < len) {
      const i = t | 0
      const f = t - i
      out.push(f === 0 ? buf[i] : buf[i] + (buf[i + 1] - buf[i]) * f)
      t += this.ratio
    }

    // 只留最后 1 个样本给下一块；t 换算成新缓冲里的坐标
    const keep = 1
    this._tail = buf.subarray(len - keep)
    this._t = t - (len - keep)
    this.outCount += out.length

    const ints = new Int16Array(out.length)
    for (let k = 0; k < out.length; k++) ints[k] = floatToInt16(out[k])
    return ints
  }

  /** 结束：清掉不足一个输出样本的残尾 */
  flush() {
    this._tail = new Float32Array(0)
    this._t = 0
  }
}
