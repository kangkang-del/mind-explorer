<template>
  <button
    class="xm-sprout"
    type="button"
    title="唤醒小木"
    aria-label="唤醒小木"
    @click.stop="emit('wake')"
  >
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g class="xm-sprout-plant">
        <!-- 土丘 -->
        <path
          d="M14 55 Q32 47 50 55"
          stroke="var(--xm-line, #2b2b2b)"
          stroke-width="3"
          stroke-linecap="round"
        />
        <!-- 茎 -->
        <path
          d="M32 53 C32 45 31 38 32 28"
          stroke="var(--xm-line, #2b2b2b)"
          stroke-width="3"
          stroke-linecap="round"
        />
        <!-- 左叶 -->
        <path
          class="xm-sprout-leaf"
          d="M32 38 C22 36 15 28 16 18 C26 19 32 27 32 38 Z"
          fill="var(--xm-leaf-soft, #e7f4e0)"
          stroke="var(--xm-line, #2b2b2b)"
          stroke-width="3"
          stroke-linejoin="round"
        />
        <!-- 右叶 -->
        <path
          class="xm-sprout-leaf"
          d="M32 30 C42 28 49 20 48 10 C38 11 32 19 32 30 Z"
          fill="var(--xm-leaf-soft, #e7f4e0)"
          stroke="var(--xm-line, #2b2b2b)"
          stroke-width="3"
          stroke-linejoin="round"
        />
      </g>
    </svg>
    <span class="xm-sprout-hint">点点我</span>
  </button>
</template>

<script setup>
/**
 * XiaomuSprout —— 收起态小嫩芽（M1 任务 7，批次 C）
 *
 * 小木「休息」后缩成一颗会呼吸的小嫩芽：
 *   - 整体呼吸（scale 起伏）+ 叶片摇曳，纯 transform 动画
 *   - 点击长回小木（emit('wake')，入场动画由父级 xm-grow 负责）
 *   - 线条风与主形象同规范：黑线 3px 圆角、叶绿 #e7f4e0 填充
 */
const emit = defineEmits(['wake'])
</script>

<style>
.xm-sprout {
  --xm-line: #2b2b2b;
  --xm-leaf-soft: #e7f4e0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  width: 56px;
  padding: 4px 0 2px;
  background: none;
  border: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  font-family: inherit;
}
.xm-sprout:focus-visible {
  outline: 2px dashed rgba(43, 43, 43, 0.35);
  outline-offset: 2px;
  border-radius: 10px;
}
.xm-sprout svg {
  width: 44px;
  height: 44px;
  display: block;
  transform-origin: 50% 88%;
  animation: xmSproutBreathe 3.2s ease-in-out infinite;
}
.xm-sprout-plant {
  transform-origin: 32px 55px;
  animation: xmSproutSway 4.6s ease-in-out infinite;
}
.xm-sprout:hover svg,
.xm-sprout:focus-visible svg {
  animation-duration: 2s; /* hover 时呼吸加快，像被逗笑 */
}
.xm-sprout-hint {
  font-size: 10px;
  line-height: 1.4;
  color: rgba(43, 43, 43, 0.45);
  opacity: 0;
  transition: opacity 0.2s ease;
  user-select: none;
}
.xm-sprout:hover .xm-sprout-hint,
.xm-sprout:focus-visible .xm-sprout-hint {
  opacity: 1;
}

@keyframes xmSproutBreathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.07); }
}
@keyframes xmSproutSway {
  0%, 100% { transform: rotate(-2.5deg); }
  50% { transform: rotate(2.5deg); }
}

@media (prefers-reduced-motion: reduce) {
  .xm-sprout svg,
  .xm-sprout-plant {
    animation: none;
  }
}
</style>
