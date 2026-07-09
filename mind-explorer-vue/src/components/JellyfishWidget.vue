<template>
  <!-- 情绪水母治愈挂件 - 全站可复用 -->
  <Teleport to="body">
    <div
      class="jelly-wrap"
      :class="{ docked: docked, dragging: isDragging, idle: isIdle, hidden: hidden }"
      :style="positionStyle"
      ref="wrapEl"
      role="button"
      tabindex="0"
      aria-label="情绪呼吸助手"
      @mousedown="onDragStart"
      @touchstart.passive="onDragStart"
      @mouseenter="onHoverEnter"
      @mouseleave="onHoverLeave"
      @click="onToggle"
      @keyup.enter="onToggle"
    >
      <!-- 玻璃球 -->
      <div class="jelly-orb">
        <!-- 球体高光 -->
        <span class="orb-shine"></span>
        <span class="orb-glow"></span>

        <!-- 水母本体 -->
        <div class="jellyfish">
          <div class="jelly-body">
            <div class="jelly-inner"></div>
            <div class="jelly-blush"></div>
            <div class="jelly-eyes">
              <span class="jelleye e1"></span>
              <span class="jelleye e2"></span>
            </div>
            <div class="jelly-shine"></div>
          </div>
          <div class="jelly-tentacles">
            <span class="tentacle t1"></span>
            <span class="tentacle t2"></span>
            <span class="tentacle t3"></span>
            <span class="tentacle t4"></span>
            <span class="tentacle t5"></span>
            <span class="tentacle t6"></span>
            <span class="tentacle t7"></span>
            <span class="tentacle t8"></span>
            <span class="tentacle t9"></span>
          </div>
        </div>

        <!-- 气泡 -->
        <span class="bubble b1"></span>
        <span class="bubble b2"></span>
        <span class="bubble b3"></span>
        <span class="bubble b4"></span>
        <span class="bubble b5"></span>

        <!-- 光点 -->
        <span class="sparkle s1"></span>
        <span class="sparkle s2"></span>
        <span class="sparkle s3"></span>
      </div>

      <!-- 提示文字（PC hover） -->
      <span class="jelly-hint">{{ hintText }}</span>

      <!-- 侧翼停靠时的开关按钮 -->
      <button
        v-if="docked"
        class="jelly-toggle"
        type="button"
        aria-label="展开情绪水母"
        @click.stop="expand"
        @mousedown.stop
        @touchstart.stop
      >
        🪼
      </button>
    </div>

    <!-- 迷思短句弹窗 -->
    <Transition name="popover">
      <div v-if="popoverOpen" class="jelly-popover" :style="popoverStyle">
        <p class="jelly-quote">{{ quotes[quoteIdx] }}</p>
        <button class="jelly-next" type="button" @click.stop="nextQuote" aria-label="换一句">换一句 ↻</button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  /** 初始位置：'right-bottom' | 'right-side' | 'custom' */
  initialPosition: { type: String, default: 'right-bottom' },
  /** 是否在空闲时自动停靠到侧翼 */
  autoDock: { type: Boolean, default: true },
  /** 空闲多久后停靠（毫秒） */
  dockAfter: { type: Number, default: 15000 },
  /** 治愈语池 */
  quotes: {
    type: Array,
    default: () => [
      '此刻，允许自己只是存在。',
      '每一次呼吸，都是新的开始。',
      '你的感受是真实且合理的。',
      '温柔地对待自己，像对待好朋友。',
      '不需要每时每刻都坚强。',
      '情绪像天气，来去都自然。',
      '你已经做得很好了。',
      '深呼吸，这里很安全。',
      '允许自己慢一点，也是一种勇气。',
      '把善意留给今天辛苦的你。',
    ],
  },
  /** 悬停提示文字 */
  hintText: { type: String, default: '点击与我呼吸同步' },
})

const wrapEl = ref(null)
const isDragging = ref(false)
const docked = ref(false)   // 停靠到侧翼（缩小成圆形按钮）
const hidden = ref(false)    // 用户手动隐藏
const popoverOpen = ref(false)
const isIdle = ref(false)
const quoteIdx = ref(0)

let dragStartX = 0, dragStartY = 0
let widgetStartX = 0, widgetStartY = 0
let hasMoved = false
let idleTimer = null
let popoverTimer = null

const pos = ref({ x: 0, y: 0, custom: false })
const posBeforeDock = ref({ x: 0, y: 0 })

/* ============ 位置计算 ============ */
const positionStyle = computed(() => {
  if (hidden.value) return { display: 'none' }
  if (docked.value) {
    return { right: '12px', bottom: '40vh', left: 'auto', top: 'auto' }
  }
  if (!pos.value.custom) {
    return { right: '24px', bottom: '32px', left: 'auto', top: 'auto' }
  }
  return { left: pos.value.x + 'px', top: pos.value.y + 'px', right: 'auto', bottom: 'auto' }
})

const popoverStyle = computed(() => {
  if (docked.value) return { right: '80px', bottom: '42vh' }
  if (!pos.value.custom) return { right: '110px', bottom: '50px' }
  return { left: (pos.value.x - 230) + 'px', top: (pos.value.y - 10) + 'px' }
})

/* ============ 拖拽 ============ */
function getPos() {
  if (!wrapEl.value) return { x: 0, y: 0 }
  const r = wrapEl.value.getBoundingClientRect()
  return { x: r.left, y: r.top }
}

function onDragStart(e) {
  if (docked.value) return
  const point = e.touches ? e.touches[0] : e
  const p = getPos()
  dragStartX = point.clientX
  dragStartY = point.clientY
  widgetStartX = p.x
  widgetStartY = p.y
  hasMoved = false
  document.addEventListener(e.touches ? 'touchmove' : 'mousemove', onDragMove, { passive: false })
  document.addEventListener(e.touches ? 'touchend' : 'mouseup', onDragEnd)
  resetIdle()
}

function onDragMove(e) {
  const point = e.touches ? e.touches[0] : e
  const dx = point.clientX - dragStartX
  const dy = point.clientY - dragStartY
  if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
    if (!isDragging.value) {
      isDragging.value = true
      docked.value = false
    }
  }
  if (isDragging.value && wrapEl.value) {
    const newX = widgetStartX + dx
    const newY = widgetStartY + dy
    const maxX = window.innerWidth - wrapEl.value.offsetWidth - 4
    const maxY = window.innerHeight - wrapEl.value.offsetHeight - 4
    pos.value = {
      x: Math.max(4, Math.min(newX, maxX)),
      y: Math.max(4, Math.min(newY, maxY)),
      custom: true,
    }
    hasMoved = true
    if (e.cancelable) e.preventDefault()
  }
}

function onDragEnd() {
  document.removeEventListener('touchmove', onDragMove)
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('touchend', onDragEnd)
  document.removeEventListener('mouseup', onDragEnd)
  if (isDragging.value) {
    isDragging.value = false
    // 接近右边/左边边缘自动停靠
    if (props.autoDock) checkAutoDock()
  }
  resetIdle()
}

function checkAutoDock() {
  if (!wrapEl.value) return
  const r = wrapEl.value.getBoundingClientRect()
  if (window.innerWidth - r.right < 30) {
    posBeforeDock.value = { x: pos.value.x, y: pos.value.y }
    docked.value = true
  }
}

/* ============ 悬停（PC） ============ */
function onHoverEnter() {
  if (docked.value) return
  if (wrapEl.value) wrapEl.value.style.animationPlayState = 'paused'
}
function onHoverLeave() {
  if (docked.value) return
  if (wrapEl.value) wrapEl.value.style.animationPlayState = 'running'
}

/* ============ 点击：展开/收起短句 ============ */
function onToggle(e) {
  if (hasMoved) { hasMoved = false; return }
  if (docked.value) { expand(); return }
  e.stopPropagation()
  if (popoverOpen.value) {
    popoverOpen.value = false
  } else {
    popoverOpen.value = true
    nextQuote()
  }
}

function nextQuote() {
  quoteIdx.value = (quoteIdx.value + 1) % props.quotes.length
}

function expand() {
  docked.value = false
  if (posBeforeDock.value.x) {
    pos.value = { ...posBeforeDock.value, custom: true }
  } else {
    pos.value = { x: 0, y: 0, custom: false }
  }
  resetIdle()
}

/* ============ 隐藏/显示（侧翼开关的二次点击） ============ */
function onGlobalClick(e) {
  if (popoverOpen.value) {
    const pop = document.querySelector('.jelly-popover')
    if (pop && !pop.contains(e.target) && !wrapEl.value?.contains(e.target)) {
      popoverOpen.value = false
    }
  }
}

/* ============ 空闲检测 ============ */
function resetIdle() {
  isIdle.value = false
  clearTimeout(idleTimer)
  if (!props.autoDock || docked.value) return
  idleTimer = setTimeout(() => {
    isIdle.value = true
  }, props.dockAfter)
}

/* ============ 生命周期 ============ */
onMounted(() => {
  document.addEventListener('click', onGlobalClick)
  resetIdle()
})

onUnmounted(() => {
  document.removeEventListener('click', onGlobalClick)
  clearTimeout(idleTimer)
})
</script>

<style>
/* ============ 整体包裹 ============ */
.jelly-wrap {
  position: fixed;
  z-index: 1050;
  cursor: grab;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  outline: none;
  --breath-dur: 4.5s;
  --tentacle-dur: 4.5s;
  --jelly-size: 86px;
  animation: jellyBreath var(--breath-dur) ease-in-out infinite;
  transition: opacity 0.5s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.jelly-wrap.dragging { cursor: grabbing; transition: none; }
.jelly-wrap.idle { opacity: 0.45; }
.jelly-wrap.docked {
  --jelly-size: 46px;
  --breath-dur: 6s;
  --tentacle-dur: 6s;
  animation: jellyDockedBreath 4s ease-in-out infinite;
  cursor: pointer;
}
.jelly-wrap.docked .jelly-orb,
.jelly-wrap.docked .jellyfish,
.jelly-wrap.docked .bubble,
.jelly-wrap.docked .sparkle,
.jelly-wrap.docked .jelly-hint {
  display: none;
}
.jelly-wrap.docked:hover { opacity: 0.85; }

/* ============ 玻璃球 ============ */
.jelly-orb {
  position: relative;
  width: var(--jelly-size);
  height: var(--jelly-size);
  border-radius: 50%;
  background:
    radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.7), rgba(180, 220, 230, 0.3) 50%, rgba(150, 200, 220, 0.2) 100%);
  backdrop-filter: blur(8px) saturate(140%);
  -webkit-backdrop-filter: blur(8px) saturate(140%);
  border: 1.5px solid rgba(255, 255, 255, 0.55);
  box-shadow:
    inset 0 0 18px rgba(255, 255, 255, 0.4),
    inset 8px 12px 24px rgba(150, 200, 220, 0.18),
    0 6px 22px rgba(100, 160, 200, 0.22),
    0 0 32px rgba(140, 200, 220, 0.18);
  overflow: visible;
  animation: orbFloat 5.5s ease-in-out infinite;
}

/* 球体高光（强化质感） */
.orb-shine {
  position: absolute;
  top: 12%;
  left: 22%;
  width: 28%;
  height: 18%;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0) 70%);
  filter: blur(2px);
  animation: shineShift 6s ease-in-out infinite;
  pointer-events: none;
}
.orb-glow {
  position: absolute;
  top: -8%;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
  height: 20%;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(255, 255, 255, 0.4) 0%, transparent 70%);
  filter: blur(3px);
  pointer-events: none;
  animation: glowPulse 5.5s ease-in-out infinite;
}

/* ============ 水母本体 ============ */
.jellyfish {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 56%;
  height: 70%;
  animation: jellySwim var(--tentacle-dur) ease-in-out infinite;
  z-index: 2;
}
.jelly-body {
  position: relative;
  width: 100%;
  height: 38%;
  background: radial-gradient(ellipse at 50% 30%, #c8e7ee 0%, #a3c4d6 60%, #7eb3c4 100%);
  border-radius: 50% 50% 30% 30% / 60% 60% 40% 40%;
  box-shadow:
    inset 0 -3px 6px rgba(80, 130, 150, 0.35),
    0 1px 4px rgba(100, 160, 180, 0.3);
  animation: jellyPulse var(--tentacle-dur) ease-in-out infinite;
  overflow: visible;
}
.jelly-inner {
  position: absolute;
  top: 18%;
  left: 50%;
  transform: translateX(-50%);
  width: 70%;
  height: 50%;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(220, 240, 245, 0.7), transparent 70%);
  animation: innerGlow var(--tentacle-dur) ease-in-out infinite;
}
.jelly-blush {
  position: absolute;
  top: 45%;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
  height: 18%;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(246, 165, 192, 0.55) 0%, transparent 70%);
  filter: blur(1px);
  animation: blushPulse 9s ease-in-out infinite;
  pointer-events: none;
}
.jelly-eyes {
  position: absolute;
  top: 38%;
  left: 50%;
  transform: translateX(-50%);
  width: 50%;
  height: 12%;
  display: flex;
  justify-content: space-between;
  z-index: 3;
}
.jelleye {
  width: 14%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #2c3e50, #0f1820);
  box-shadow: 0 0 3px rgba(88, 158, 218, 0.5);
  animation: blink var(--tentacle-dur) ease-in-out infinite;
}
.e2 { animation-delay: 0.08s; }
.jelly-shine {
  position: absolute;
  top: 8%;
  left: 50%;
  transform: translateX(-50%);
  width: 30%;
  height: 22%;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(255, 255, 255, 0.7) 0%, transparent 75%);
  pointer-events: none;
  z-index: 4;
}

/* ============ 触手（9 条独立动画） ============ */
.jelly-tentacles {
  position: absolute;
  top: 38%;
  left: 50%;
  transform: translateX(-50%);
  width: 80%;
  height: 60%;
  z-index: 1;
  pointer-events: none;
}
.tentacle {
  position: absolute;
  top: 0;
  width: 1.5px;
  height: 80%;
  background: linear-gradient(180deg, #7eb3c4 0%, transparent 100%);
  transform-origin: top center;
  opacity: 0.7;
  animation: tentacleWave var(--tentacle-dur) ease-in-out infinite;
  filter: blur(0.3px);
}
.t1 { left: 8%;  animation-delay: 0s;    height: 70%; }
.t2 { left: 18%; animation-delay: 0.24s; height: 85%; }
.t3 { left: 28%; animation-delay: 0.11s; height: 78%; }
.t4 { left: 38%; animation-delay: 0.34s; height: 90%; width: 2px; }
.t5 { left: 48%; animation-delay: 0.17s; height: 82%; }
.t6 { left: 58%; animation-delay: 0.29s; height: 88%; width: 2px; }
.t7 { left: 68%; animation-delay: 0.06s; height: 75%; }
.t8 { left: 78%; animation-delay: 0.21s; height: 80%; }
.t9 { left: 88%; animation-delay: 0.13s; height: 68%; }

/* ============ 气泡 + 光点（强化氛围） ============ */
.bubble {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.9), rgba(200, 230, 240, 0.4) 60%, transparent);
  pointer-events: none;
  opacity: 0;
  animation: bubbleRise var(--bd, 4s) ease-in infinite;
  animation-delay: var(--ad, 0s);
}
.b1 { width: 4px; height: 4px; left: 20%; bottom: 10%; --bd: 4.2s; --ad: 0s; }
.b2 { width: 6px; height: 6px; left: 70%; bottom: 5%; --bd: 5.5s; --ad: 1.2s; }
.b3 { width: 3px; height: 3px; left: 45%; bottom: 15%; --bd: 3.8s; --ad: 2.4s; }
.b4 { width: 5px; height: 5px; left: 85%; bottom: 20%; --bd: 5s; --ad: 0.8s; }
.b5 { width: 4px; height: 4px; left: 30%; bottom: 8%; --bd: 4.6s; --ad: 3s; }

.sparkle {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 6px rgba(255, 255, 255, 0.8);
  pointer-events: none;
  opacity: 0;
  animation: sparkleFloat var(--sd, 3s) ease-in-out infinite;
  animation-delay: var(--sad, 0s);
}
.s1 { top: 20%; left: 15%; --sd: 3.2s; --sad: 0.4s; }
.s2 { top: 70%; right: 18%; --sd: 4.1s; --sad: 1.6s; }
.s3 { top: 35%; right: 8%; --sd: 3.6s; --sad: 2.4s; }

/* ============ 提示文字 ============ */
.jelly-hint {
  position: absolute;
  top: -34px;
  left: 50%;
  transform: translateX(-50%) translateY(8px);
  white-space: nowrap;
  font-size: 0.75rem;
  color: #5a7689;
  background: rgba(255, 253, 249, 0.92);
  padding: 5px 12px;
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(150, 170, 180, 0.2);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.3s ease, transform 0.3s ease, visibility 0.3s;
  pointer-events: none;
  letter-spacing: 0.03em;
  z-index: 810;
}
.jelly-wrap:hover .jelly-hint {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(0);
}

/* ============ 侧翼停靠按钮 ============ */
.jelly-toggle {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.7);
  background: radial-gradient(circle at 30% 30%, rgba(220, 240, 250, 0.85), rgba(160, 210, 230, 0.6) 70%, rgba(140, 200, 220, 0.4));
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow:
    0 4px 16px rgba(100, 160, 200, 0.3),
    inset 0 0 10px rgba(255, 255, 255, 0.5);
  cursor: pointer;
  font-size: 1.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.3s;
  animation: jellyTogglePeek 3.5s ease-in-out infinite;
}
.jelly-toggle:hover {
  transform: scale(1.1);
  box-shadow:
    0 6px 22px rgba(100, 160, 200, 0.4),
    inset 0 0 14px rgba(255, 255, 255, 0.7);
}

/* ============ 迷思弹窗 ============ */
.jelly-popover {
  position: fixed;
  z-index: 1051;
  background: rgba(255, 253, 249, 0.92);
  backdrop-filter: blur(10px) saturate(140%);
  -webkit-backdrop-filter: blur(10px) saturate(140%);
  border: 1px solid rgba(150, 200, 220, 0.3);
  border-radius: 16px;
  padding: 16px 20px;
  box-shadow:
    0 10px 30px rgba(100, 160, 200, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
  max-width: 240px;
  text-align: left;
}
.jelly-quote {
  font-family: 'Source Han Serif SC', 'Songti SC', serif;
  font-size: 0.95rem;
  line-height: 1.6;
  color: #4a6a7e;
  margin: 0 0 10px;
  letter-spacing: 0.04em;
}
.jelly-next {
  background: transparent;
  border: 1px solid rgba(150, 200, 220, 0.4);
  color: #6a8a9a;
  font-size: 0.78rem;
  padding: 4px 12px;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s;
}
.jelly-next:hover {
  background: rgba(180, 220, 230, 0.3);
  color: #4a6a7e;
}
.popover-enter-active, .popover-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.popover-enter-from, .popover-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.95);
}

/* ============ 关键帧动画 ============ */
@keyframes jellyBreath {
  0%, 100% { transform: scale(1) translateY(0); }
  50% { transform: scale(1.06) translateY(-2px); }
}
@keyframes jellyDockedBreath {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}
@keyframes orbFloat {
  0%, 100% { transform: translateY(0) rotate(0); }
  50% { transform: translateY(-3px) rotate(0.5deg); }
}
@keyframes jellySwim {
  0%, 100% { transform: translate(-50%, -50%) rotate(-1.5deg); }
  50% { transform: translate(-50%, -52%) rotate(1.5deg); }
}
@keyframes jellyPulse {
  0%, 100% { transform: scale(1, 1); }
  50% { transform: scale(1.08, 0.95); }
}
@keyframes innerGlow {
  0%, 100% { opacity: 0.55; transform: translateX(-50%) scale(1); }
  50% { opacity: 1; transform: translateX(-50%) scale(1.18); }
}
@keyframes blink {
  0%, 86%, 92%, 100% { transform: scaleY(1); opacity: 1; }
  89% { transform: scaleY(0.15); opacity: 0.6; }
}
@keyframes blushPulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 0.95; }
}
@keyframes tentacleWave {
  0%, 100% { transform: rotate(-12deg) scaleY(1); }
  50% { transform: rotate(12deg) scaleY(1.15); }
}
@keyframes bubbleRise {
  0% { transform: translateY(0); opacity: 0; }
  15% { opacity: 0.9; }
  85% { opacity: 0.7; }
  100% { transform: translateY(-90px); opacity: 0; }
}
@keyframes sparkleFloat {
  0%, 100% { transform: translate(0, 0) scale(0.6); opacity: 0; }
  50% { transform: translate(4px, -4px) scale(1.2); opacity: 1; }
}
@keyframes shineShift {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(2px, 1px) scale(1.1); }
}
@keyframes glowPulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
@keyframes jellyTogglePeek {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05) translateX(-2px); }
}

/* ============ 响应式：移动端优化 ============ */
@media (max-width: 768px) {
  .jelly-wrap { --jelly-size: 64px; }
  .jelly-wrap.docked { --jelly-size: 40px; }
  .jelly-hint { display: none !important; }
  .bubble, .sparkle { display: none; }
}
@media (max-width: 480px) {
  .jelly-wrap { --jelly-size: 54px; }
  .jelly-wrap.docked { --jelly-size: 36px; right: 8px !important; }
}
@media (prefers-reduced-motion: reduce) {
  .jelly-wrap, .jelly-orb, .jellyfish, .jelly-body, .jelly-inner,
  .jelly-blush, .jelleye, .jelly-shine, .tentacle, .bubble, .sparkle,
  .orb-shine, .orb-glow, .jelly-toggle {
    animation: none !important;
  }
}
</style>
