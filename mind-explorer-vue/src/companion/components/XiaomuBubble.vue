<template>
  <Transition name="xm-bubble-pop">
    <div
      v-if="visible"
      ref="bubbleEl"
      class="xm-bubble"
      :class="[{ 'is-user': mode === 'user', 'is-typing': typing }]"
      :style="clampStyle"
      @pointerdown.stop="onLongPressStart"
      @pointerup.stop="onLongPressEnd"
      @pointercancel.stop="onLongPressEnd"
      @pointerleave="onLongPressEnd"
      @click.stop="skipTyping"
    >
      <div ref="textEl" class="xm-bubble-text">{{ displayed }}</div>

      <!-- 快捷指令 chips -->
      <div v-if="chips && chips.length" class="xm-bubble-chips">
        <button
          v-for="c in chips"
          :key="c.key"
          class="xm-chip"
          type="button"
          @click.stop="emit('chip', c)"
        >{{ c.label }}</button>
        <button class="xm-chip xm-chip-input" type="button" aria-label="打字和小木聊" @click.stop="emit('open-chat')">
          ⌨
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup>
/**
 * XiaomuBubble —— 气泡系统 v1（M1 任务 5）
 *
 * 能力：
 *  - 打字机逐字上屏（fullText 变化自动重播；点气泡跳过动画）
 *  - 快捷指令 chips + 输入入口按钮
 *  - 视口边缘 clamp：小木被拖到屏幕边时气泡自动收进视口
 *  - 双态：xomu（白底） / user（米底，用户刚说的话）
 *  - 长按气泡：emit('history')——最近对话小抽屉由父级渲染（v-on-long-press 指令式自实现）
 *
 * 定位约定：本组件挂在 XiaomuPet 容器内，CSS 相对小木定位在头顶上方；
 * clamp 通过测量视口边界改 translateX 实现。
 */
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  fullText: { type: String, default: '' },
  /** 'xomu' | 'user' */
  mode: { type: String, default: 'xomu' },
  /** [{ key, label }] */
  chips: { type: Array, default: null },
})

const emit = defineEmits(['typed', 'chip', 'open-chat', 'history'])

/* ---- 打字机 ----
 * 两种驱动方式：
 *  - 整句模式：fullText prop 替换 → watch 重置重播（greeting / 道歉等一次性文本）
 *  - 流式模式：beginStream / pushChunk / endStream —— SSE 增量直接推入，
 *    打字机追平 target 后挂起等下一个 delta，绝不整段重播；
 *    流式期间 watch 被屏蔽，结束后同步 fullText 也不会误触发重播
 */
const displayed = ref('')
const typing = ref(false)
let typeTimer = null
let targetChars = []      // 目标文本（字符数组，兼容 emoji 代理对）
let targetFull = ''       // targetChars.join('')，skipTyping 兜底用
let shown = 0             // 已显示字符数
let targetDone = true     // 目标文本是否已到齐（流式未结束时 false）
let doneEmitted = false
let streaming = false

const PAUSE_CHARS = '，。？！…、'

function step() {
  if (shown >= targetChars.length) {
    // 追平目标：流已结束 → 收尾；流未结束 → 挂起等 pushChunk 续上
    if (targetDone && !doneEmitted) {
      typing.value = false
      doneEmitted = true
      emit('typed')
    }
    return
  }
  shown++
  displayed.value = targetChars.slice(0, shown).join('')
  // 标点停顿更像说话的节奏
  const pause = PAUSE_CHARS.includes(targetChars[shown - 1]) ? 150 : 34
  typeTimer = setTimeout(step, pause)
}

function resetType(text, done = true) {
  clearTimeout(typeTimer)
  targetFull = text
  targetChars = Array.from(text)
  shown = 0
  targetDone = done
  doneEmitted = false
  if (!text) {
    displayed.value = ''
    typing.value = false
    return
  }
  typing.value = true
  step()
}

watch(
  () => [props.visible, props.fullText, props.mode],
  () => {
    if (streaming) return
    if (!props.visible) {
      clearTimeout(typeTimer)
      displayed.value = ''
      typing.value = false
      return
    }
    // 用户消息直接整句显示，小木消息逐字
    if (props.mode === 'user') {
      clearTimeout(typeTimer)
      targetFull = props.fullText
      targetChars = Array.from(props.fullText)
      shown = targetChars.length
      targetDone = true
      doneEmitted = false
      displayed.value = props.fullText
      typing.value = false
      return
    }
    // 流式结束后父级同步的 fullText 与当前目标一致：不必重播
    if (props.fullText === targetFull) return
    resetType(props.fullText)
  },
  { immediate: true }
)

function skipTyping() {
  if (!typing.value) return
  clearTimeout(typeTimer)
  shown = targetChars.length
  displayed.value = targetFull
  typing.value = false
  if (targetDone && !doneEmitted) {
    doneEmitted = true
    emit('typed')
  }
}

/* ---- 流式接口（SSE，由父级在 chat 回调里驱动） ---- */

/** 开始一条流式消息（可选带开头文本） */
function beginStream(initial = '') {
  streaming = true
  resetType(initial, false)
}

/** 追加一个流式增量 */
function pushChunk(chunk) {
  if (!chunk) return
  targetFull += chunk
  targetChars.push(...Array.from(chunk))
  if (!typing.value && targetChars.length > shown) {
    typing.value = true
    step()
  }
}

/** 流结束：若打字已追平则立即收尾，否则让打字机自然追完 */
function endStream() {
  targetDone = true
  if (shown >= targetChars.length && !doneEmitted) {
    typing.value = false
    doneEmitted = true
    emit('typed')
  }
  streaming = false
}

/** 中途放弃（错误/中断）：退出流式态并清屏，回到整句模式 */
function abortStream() {
  clearTimeout(typeTimer)
  streaming = false
  targetChars = []
  targetFull = ''
  shown = 0
  targetDone = true
  doneEmitted = false
  displayed.value = ''
  typing.value = false
}

/* ---- 长按气泡 → 历史（500ms，pointer 松开/移出取消） ---- */
let pressTimer = null
function onLongPressStart() {
  clearTimeout(pressTimer)
  pressTimer = setTimeout(() => emit('history'), 500)
}
function onLongPressEnd() { clearTimeout(pressTimer) }

/* ---- 视口 clamp（防拖到屏幕边后气泡出界） ---- */
const bubbleEl = ref(null)
const clampStyle = ref({})
let clampRaf = 0

function clampToViewport() {
  cancelAnimationFrame(clampRaf)
  clampRaf = requestAnimationFrame(() => {
    const el = bubbleEl.value
    if (!el) return
    const r = el.getBoundingClientRect()
    const margin = 8
    let dx = 0
    if (r.left < margin) dx = margin - r.left
    else if (r.right > innerWidth - margin) dx = innerWidth - margin - r.right
    clampStyle.value = dx ? { transform: `translate(calc(-50% + ${dx}px), 0)` } : {}
  })
}

watch(() => [props.visible, props.fullText, displayed.value], () => {
  nextTick(clampToViewport)
}, { immediate: true })

addEventListener('resize', clampToViewport, { passive: true })
onBeforeUnmount(() => {
  clearTimeout(typeTimer)
  clearTimeout(pressTimer)
  cancelAnimationFrame(clampRaf)
  removeEventListener('resize', clampToViewport)
})

defineExpose({ skipTyping, typing, beginStream, pushChunk, endStream, abortStream })
</script>

<style>
.xm-bubble {
  position: absolute;
  bottom: calc(100% + 14px);
  left: 50%;
  transform: translateX(-50%);
  max-width: min(240px, 68vw);
  background: #fff;
  border: 1.5px solid var(--xm-line, #2b2b2b);
  border-radius: 14px;
  padding: 8px 12px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--xm-line, #2b2b2b);
  z-index: 6;
  word-break: break-word;
  box-sizing: border-box;
  font-family: 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
}
.xm-bubble.is-user { background: #f4efe4; }
.xm-bubble::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -7.5px;
  width: 12px;
  height: 12px;
  background: inherit;
  border-right: 1.5px solid var(--xm-line, #2b2b2b);
  border-bottom: 1.5px solid var(--xm-line, #2b2b2b);
  transform: translateX(-50%) rotate(45deg);
}
.xm-bubble-text { min-height: 1em; }

/* chips */
.xm-bubble-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.xm-chip {
  border: 1.5px solid var(--xm-line, #2b2b2b);
  background: #fff;
  color: var(--xm-line, #2b2b2b);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  min-height: 28px;
  transition: transform .08s, background .15s, color .15s;
  font-family: inherit;
}
.xm-chip:active { transform: scale(.94); }
.xm-chip-input { padding: 4px 9px; }

/* 出场动画：从小木头顶冒出 */
.xm-bubble-pop-enter-active { transition: opacity .18s ease-out, transform .18s cubic-bezier(.34, 1.56, .64, 1); }
.xm-bubble-pop-leave-active { transition: opacity .12s ease-in, transform .12s ease-in; }
.xm-bubble-pop-enter-from,
.xm-bubble-pop-leave-to { opacity: 0; transform: translateX(-50%) translateY(6px) scale(.9); }
</style>
