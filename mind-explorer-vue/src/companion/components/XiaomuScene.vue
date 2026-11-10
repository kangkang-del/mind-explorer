<template>
  <div
    v-if="phase !== 'dead'"
    ref="wrapEl"
    class="xm-scene"
    :class="{ 'is-in': phase === 'shown' }"
    :style="{ transitionDuration: fade + 'ms' }"
    role="img"
    aria-label="小木画的一幅画"
  >
    <iframe
      v-if="phase !== 'wait'"
      ref="frameEl"
      class="xm-scene-frame"
      sandbox="allow-scripts"
      referrerpolicy="no-referrer"
      title="小木画的一幅画"
      :srcdoc="srcdoc"
      @load="onLoad"
    ></iframe>
  </div>
</template>

<script setup>
/**
 * XiaomuScene —— 小木自己写的画面卡片（M7 #113）
 *
 * 时序（这是本组件唯一复杂的地方）：
 *
 *   代码写完 ──800ms──► 创建 iframe（opacity:0，看不见但**已经在跑**）
 *                        │
 *                        ├─ 收到首帧信号 / load ──► 加 .is-in，1300ms 淡入
 *                        └─ 10s 什么都没有 ──────► 撤掉卡片
 *
 * 为什么不能「创建即淡入」：iframe 首帧还没画出来时就开始淡入，1300ms 的过渡会把
 * **一张白纸**慢慢显出来。必须先挂载、等到「真的画了」、再淡入 —— 这样淡入开始时
 * 画面已经在动，用户看到的是「从雾里慢慢显形」，而不是「先白一下，再出现」。
 *
 * 安全（三道防线，本组件是第三道）：
 *   1. 父级只在 auditScene 通过后才给 code（第一道，sceneAudit.js）
 *   2. sandbox="allow-scripts" —— 🔴 绝不加 allow-same-origin
 *      ⇒ opaque origin：读不到父页面 DOM / cookie / localStorage
 *   3. CSP default-src 'none'（sceneAudit.toSrcDoc 注入）
 *      ⇒ 即使代码里写 fetch 也发不出去
 */

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { auditScene, toSrcDoc } from '../core/sceneAudit'

const props = defineProps({
  /** 模型生成的代码（父级保证「已写完」） */
  code: { type: String, required: true },
  /** 配文后停顿，再到画面出场 */
  delay: { type: Number, default: 800 },
  /** 进场过渡时长（与 CSS 里的 transition-duration 保持一致） */
  fade: { type: Number, default: 1300 },
})

const emit = defineEmits(['fail'])

/** wait → mount（iframe 已建、不可见）→ shown（淡入中/已完成）→ dead（撤掉） */
const phase = ref('wait')

const wrapEl = ref(null)
const frameEl = ref(null)

const srcdoc = computed(() => toSrcDoc(props.code))

let delayTimer = null
let fadeTimer = null
let paintTimer = null
let loadAt = 0
let painted = false
let killed = false

function kill(reason) {
  if (killed) return
  killed = true
  phase.value = 'dead'
  clearTimers()
  removeEventListener('message', onMessage)
  emit('fail', reason)
}

function clearTimers() {
  clearTimeout(delayTimer)
  clearTimeout(fadeTimer)
  clearTimeout(paintTimer)
}

/** 开始淡入（幂等） */
function reveal() {
  if (killed || phase.value === 'shown' || phase.value === 'dead') return
  if (phase.value !== 'mount') return
  phase.value = 'shown'
}

function onLoad() {
  loadAt = Date.now()
  // load 之后留 1 帧余量再放行：srcdoc 的 load 有时早于首次绘制
  clearTimeout(fadeTimer)
  fadeTimer = setTimeout(reveal, 120)
}

/**
 * 首帧信号。iframe 是 opaque origin，父页面**读不到**它的 DOM，
 * 所以「白屏检测」只能靠它自己报信。这条是 we 自己注入的固定脚本（不含任何插值）。
 */
function onMessage(e) {
  if (!frameEl.value || e.source !== frameEl.value.contentWindow) return
  if (e.data !== 'xm-scene-paint') return
  painted = true
  reveal()
}

onMounted(() => {
  // 第一道闸：审计不过就别建 iframe（省一次解析，也少一次暴露面）
  const audit = auditScene(props.code)
  if (!audit.ok) {
    kill('audit: ' + audit.issues.join(' / '))
    return
  }

  addEventListener('message', onMessage)

  delayTimer = setTimeout(() => {
    if (killed) return
    phase.value = 'mount'
    // 10s 硬闸：既没 load 也没首帧信号 ⇒ 这画面是死的，别占着位置
    paintTimer = setTimeout(() => {
      if (!painted && !loadAt) kill('no paint in 10s')
    }, 10000)
  }, props.delay)
})

onBeforeUnmount(() => {
  killed = true
  clearTimers()
  removeEventListener('message', onMessage)
})

defineExpose({ phase })
</script>

<style scoped>
.xm-scene {
  height: 230px;
  border: 1px solid #e6efe9;
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
  /* 出场前就位：透明、略小、略糊 */
  opacity: 0;
  transform: scale(0.988);
  filter: blur(7px);
  transition:
    opacity 1300ms cubic-bezier(0.22, 0.61, 0.36, 1),
    transform 1300ms cubic-bezier(0.22, 0.61, 0.36, 1),
    filter 1300ms cubic-bezier(0.22, 0.61, 0.36, 1);
  will-change: opacity, transform, filter;
}
.xm-scene.is-in {
  opacity: 1;
  transform: scale(1);
  filter: blur(0);
}
.xm-scene-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: transparent;
}
</style>
