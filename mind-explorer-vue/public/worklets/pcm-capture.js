/**
 * 麦克风采集 AudioWorkletProcessor（M6-2a）
 *
 * 职责：把 `MediaStreamAudioSourceNode` 送来的 Float32（设备原生采样率，通常 48k）
 * 转成讯飞要求的 **16k / 16bit / 单声道 / 小端 PCM 字节流**，按 ~40ms 一块发给主线程；
 * 顺带回一个归一化音量（RMS）给「波形随音量实时起伏」用。
 *
 * 为什么不放在 `src/`：它要 `import './pcm16.js'`。worklet 以 **module script**
 * 加载，import 可用，但 URL 相对于 worklet 自身 → 两者必须同目录静态文件。
 * 放 `public/worklets/` 下，dev 与 `vite build` 后路径一致（`/worklets/…`）。
 *
 * 主线程用法见 `src/companion/composables/useMicCapture.js`。
 */
import { Pcm16Downsampler, int16ToLeBytes, rms, TARGET_RATE } from './pcm16.js'

/** 送帧粒度：640 样本 @16k ≈ 40ms —— 讯飞官方示例的推荐值 */
const CHUNK_SAMPLES = 640
/** 音量上报节流：每 8 个渲染量（8×128 帧 ≈ 21ms@48k ≈ 47 次/秒）回一次 */
const LEVEL_QUANTA = 8

/** 20 万样本上限的保险丝：万一主线程挂了，不让待发队列无限膨胀 */
const PENDING_MAX = 200000

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const opt = (options && options.processorOptions) || {}
    const inRate = opt.sampleRate || (typeof sampleRate === 'number' ? sampleRate : 48000)
    this.outRate = opt.outRate || TARGET_RATE
    this.mute = !!opt.mute

    this.down = new Pcm16Downsampler(inRate, this.outRate)
    this._pending = []      // 待凑满一块的 Int16
    this._levelMax = 0      // 本上报窗口内的最大块 RMS
    this._quanta = 0

    this.port.onmessage = (e) => {
      const d = (e && e.data) || {}
      if (d.t === 'mute') {
        this.mute = !!d.value
        if (this.mute) {
          this._levelMax = 0
          this._quanta = 0
          this.port.postMessage({ t: 'level', rms: 0 })
        }
      } else if (d.t === 'flush') {
        // 先把残尾（不足一块的样本）发掉，再回一条 ack —— 主线程据此确认
        // 「最后那几十毫秒已经交出去了」，而不是靠 sleep 猜。
        this._emit(true)
        // 注意：flush 之后不再接收新样本；主线程随后会 disconnect。
        this._pending = []
        this.port.postMessage({ t: 'flushed' })
      }
    }

    // 让主线程知道实际握手到的采样率（便于日志/自检；正常应等于 AudioContext.sampleRate）
    this.port.postMessage({ t: 'ready', inRate, outRate: this.outRate, chunk: CHUNK_SAMPLES })
  }

  /** 把 `_pending` 里凑够的样本发出去；force=true 时把不足一块的残尾也发掉 */
  _emit(force) {
    const n = this._pending.length
    if (!n) return
    if (!force && n < CHUNK_SAMPLES) return
    const bytes = int16ToLeBytes(Int16Array.from(this._pending))
    this._pending = []
    // 转移 buffer（零拷贝）。转移后本地 this._pending 已换新数组，不碰已交出的内存。
    this.port.postMessage({ t: 'pcm', rate: this.outRate, bytes }, [bytes.buffer])
  }

  process(inputs, outputs) {
    // 输出恒为静音：既杜绝回授（麦克风串到扬声器），也保证节点被音频图持续驱动
    const out = outputs && outputs[0]
    if (out) for (let c = 0; c < out.length; c++) out[c].fill(0)

    const ch = (inputs && inputs[0] && inputs[0][0]) || null
    if (!ch || !ch.length || this.mute) return true

    // —— 音量：逐块 RMS 取窗口内最大值（比跨窗口 RMS 更跟手，动效不迟钝）——
    const r = rms(ch)
    if (r > this._levelMax) this._levelMax = r
    if (++this._quanta >= LEVEL_QUANTA) {
      this.port.postMessage({ t: 'level', rms: this._levelMax })
      this._levelMax = 0
      this._quanta = 0
    }

    // —— PCM：128 帧进来，出 2~3 个 16k 样本，攒够 640 再发 ——
    const ints = this.down.push(ch)
    if (ints.length) {
      const p = this._pending
      for (let i = 0; i < ints.length; i++) p.push(ints[i])
      if (p.length > PENDING_MAX) p.splice(0, p.length - PENDING_MAX)
      this._emit(false)
    }

    // 恒返回 true：只要用户没松手（主线程没 disconnect），就一直采
    return true
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor)
