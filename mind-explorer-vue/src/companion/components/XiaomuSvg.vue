<template>
  <div class="xm-wrap" :class="{ 'is-custom': isCustom }" :data-sleeping="state === 'sleep' ? '1' : '0'">
    <svg
      ref="svgEl"
      class="xm-svg"
      viewBox="0 0 300 360"
      :data-state="state"
      :data-action="action || ''"
      :data-micros="microStr"
      :data-variant="isCustom ? 'custom' : variant"
      :data-hat="wear.hat"
      :data-scarf="wear.scarf"
      :data-bow="wear.bow"
      aria-hidden="true"
    >
      <g id="whole">
        <!-- 尾巴（背后层）：犬系摇尾 / 木灵叶尾 -->
        <g id="tail-dog" class="v-dog">
          <path class="ln" d="M198 292 C226 284 236 262 228 246" />
        </g>
        <g id="tail-leaf" class="v-wood">
          <path class="lng" d="M200 294 C224 284 232 266 224 252 C206 256 194 276 200 294 Z" />
        </g>

        <!-- 身体（圆角小躯干，上缘塞进头底下：头身比 1:0.63，无脖子断层） -->
        <path class="lnf" d="M122 226 L178 226 Q192 227 195 246 L200 288 Q201 299 190 299 L110 299 Q99 299 100 288 L105 246 Q108 227 122 226 Z" />

        <!-- 右臂（下垂；分组以便伸懒腰/拖拽摆动时独立驱动） -->
        <g id="arm-r">
          <path class="ln" d="M190 248 C206 262 208 276 202 287" />
        </g>

        <!-- 腿 + 小脚 -->
        <g id="legL">
          <path class="ln" d="M127 299 L127 330" />
          <ellipse class="lnf" cx="127" cy="334" rx="11" ry="5.5" />
        </g>
        <g id="legR">
          <path class="ln" d="M173 299 L173 330" />
          <ellipse class="lnf" cx="173" cy="334" rx="11" ry="5.5" />
        </g>

        <!-- 换装：围巾（压在头之下）—— M3 槽位制，物品 id 驱动显隐 -->
        <g id="item-scarf-red" class="item">
          <path class="lnp it-orange" d="M118 226 Q150 242 182 226 L182 239 Q150 255 118 239 Z" />
          <path class="lnp it-orange" d="M162 242 L158 266 Q165 271 172 265 L174 244 Z" />
        </g>
        <g id="item-scarf-leaf" class="item">
          <path class="lng" d="M118 226 Q150 242 182 226 L182 239 Q150 255 118 239 Z" />
          <path class="lng" d="M162 242 L158 266 Q165 271 172 265 L174 244 Z" />
          <path class="lng" d="M140 246 C132 244 128 236 130 230 C138 232 142 240 140 246 Z" />
          <path class="lng" d="M158 248 C166 246 170 238 168 232 C160 234 156 242 158 248 Z" />
        </g>

        <!-- 头组：动作轨对头的旋转/低头/仰头统一作用在这（origin≈脖子点） -->
        <g id="head-g">
          <circle class="lnf" cx="150" cy="170" r="58" />

          <!-- 犬系垂耳（加大加圆，垂到脸颊） -->
          <g id="ears-dog" class="v-dog">
            <path class="lnf" d="M120 114 C92 106 66 124 70 164 C72 188 90 200 104 192 C112 187 116 172 118 154 C119 140 120 126 120 114 Z" />
            <path class="lnf" d="M180 114 C208 106 234 124 230 164 C228 188 210 200 196 192 C188 187 184 172 182 154 C181 140 180 126 180 114 Z" />
          </g>

          <!-- 木灵嫩芽（v2 正式版挂点：整株独立驱动） -->
          <g id="sprout" class="v-wood">
            <path class="ln" d="M150 114 C149 102 150 96 150 90" />
            <path class="lng" d="M150 92 C136 92 126 80 130 68 C144 70 152 80 150 92 Z" />
            <path class="lng" d="M150 92 C164 92 174 80 170 68 C156 70 148 80 150 92 Z" />
          </g>

          <!-- 表情 -->
          <g id="face">
            <g id="eyes-open" :class="{ blink: blinking }" :style="eyeStyle">
              <circle class="dot" cx="129" cy="165" r="5" />
              <circle class="dot" cx="171" cy="165" r="5" />
            </g>
            <g id="eyes-closed">
              <path class="ln" d="M123 167 Q129 172 135 167" />
              <path class="ln" d="M165 167 Q171 172 177 167" />
            </g>
            <ellipse id="nose" class="dot v-dog" cx="150" cy="181" rx="4" ry="3" />
            <path id="mouth-smile" class="ln mouth" d="M139 193 Q150 202 161 193" />
            <path id="mouth-open" class="mouth" d="M136 191 Q150 209 164 191 Q150 197 136 191 Z" fill="var(--xm-line, #2b2b2b)" />
            <circle class="blush" cx="113" cy="188" r="6" />
            <circle class="blush" cx="187" cy="188" r="6" />
          </g>

          <!-- 换装：帽子 / 蝴蝶结（压在头之上）—— M3 槽位制 -->
          <g id="item-hat-beret" class="item">
            <path class="lnf" d="M102 134 Q118 98 156 102 Q194 106 198 134 Q150 116 102 134 Z" />
            <circle class="dot" cx="150" cy="99" r="4" />
          </g>
          <g id="item-hat-straw" class="item">
            <ellipse class="lnf it-yellow" cx="150" cy="124" rx="62" ry="11" />
            <path class="lnf it-yellow" d="M128 122 Q127 94 150 92 Q173 94 172 122 Q150 114 128 122 Z" />
            <path class="ln it-redband" d="M131 116 Q150 108 169 116" />
          </g>
          <g id="item-hat-flower" class="item">
            <g>
              <circle class="lnp" cx="106" cy="122" r="6" /><circle class="lnp" cx="118" cy="118" r="6" /><circle class="lnp" cx="112" cy="110" r="6" /><circle class="dot" cx="112" cy="117" r="3" />
            </g>
            <g>
              <circle class="lnp" cx="144" cy="108" r="6" /><circle class="lnp" cx="156" cy="108" r="6" /><circle class="lnp" cx="150" cy="100" r="6" /><circle class="dot" cx="150" cy="106" r="3" />
            </g>
            <g>
              <circle class="lnp" cx="182" cy="122" r="6" /><circle class="lnp" cx="194" cy="118" r="6" /><circle class="lnp" cx="188" cy="110" r="6" /><circle class="dot" cx="188" cy="117" r="3" />
            </g>
          </g>
          <g id="item-bow-pink" class="item">
            <path class="lnp" d="M108 128 L88 116 L88 140 Z" />
            <path class="lnp" d="M108 128 L128 116 L128 140 Z" />
            <circle class="dot" cx="108" cy="128" r="5" />
          </g>
          <g id="item-bow-star" class="item">
            <path class="lnp it-yellow" d="M108 113 L111.8 122.7 L122.3 123.4 L114.2 130 L116.8 140.1 L108 134.5 L99.2 140.1 L101.8 130 L93.7 123.4 L104.2 122.7 Z" />
          </g>
        </g>

        <!-- 左臂上举挥手（画在头组之后：圆爪盖在脸侧，参考图结构；睡觉停摆） -->
        <g id="arm-wave">
          <path class="ln" d="M112 252 C94 246 82 232 84 214" />
          <circle class="lnf" cx="85" cy="208" r="10" />
          <ellipse class="pad" cx="85" cy="210" rx="4.5" ry="3.5" />
        </g>
      </g>
    </svg>

    <!-- 自定义形象层（M3 批次 J）：图片皮肤垫底，SVG 只留配件当贴纸叠在上面 -->
    <div v-if="isCustom" class="xm-skin">
      <img :src="skinUrl" alt="我的形象" draggable="false" @error="imgBroken = true" />
    </div>

    <!-- 睡觉 Zzz -->
    <div class="xm-zzz"><span>Z</span><span>Z</span><span>Z</span></div>

    <!-- 爱心粒子（jumpJoy 动作附带 fx） -->
    <div class="xm-fx">
      <div
        v-for="h in hearts"
        :key="h.id"
        class="xm-heart"
        :style="{ left: h.left + '%', top: h.top + 'px', animationDelay: h.delay + 's' }"
      >
        <svg viewBox="0 0 24 24" width="100%" height="100%">
          <path d="M12 21 C5 14 2 10 2 6.5 C2 3.5 4.5 2 7 2 C9 2 11 3.5 12 5.5 C13 3.5 15 2 17 2 C19.5 2 22 3.5 22 6.5 C22 10 19 14 12 21 Z" fill="#ff8fab" />
        </svg>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * XiaomuSvg —— 小木 SVG 正式版形象（M1 任务 1）
 *
 * 纯展示组件：不绑交互事件（单击/双击/长按/拖拽归容器组件 XiaomuPet，批次 B），
 * 只接收三轨状态并渲染对应动画。
 *
 * 挂点清单（id 供 CSS 动画选择器使用）：
 *   whole / head-g / tail-dog / tail-leaf / sprout / arm-wave / arm-r /
 *   legL / legR / eyes-open / eyes-closed / mouth-smile / mouth-open / item-*
 *
 * 双形态：variant="wood"（木灵，默认）/ "dog"（犬系皮肤），共用图层。
 * 自定义形象（M3 批次 J）：variant="custom" + skinUrl（IndexedDB 里的图片 objectURL）时，
 *   图片层 .xm-skin 垫底（object-fit: contain，指针穿透），SVG 隐藏身体图元、只留配件
 *   （帽子/围巾/蝴蝶结）作为「贴纸」按原生挂点叠在图片上——见 xiaomu-animations.css A2 区。
 */
import { computed, reactive, ref, watch, onMounted, onUnmounted } from 'vue'
import '../styles/xiaomu-animations.css'

const props = defineProps({
  /** 基线状态：idle | talk | think | happy | sleep | drag | walk */
  state: { type: String, default: 'idle' },
  /** 当前一次性动作名（useXiaomuState.action），null = 无 */
  action: { type: String, default: null },
  /** 微表情对象：{ blush, eyesClosed, eyesWide, earDroop }（useXiaomuState.micro） */
  micro: { type: Object, default: () => ({}) },
  /** 形态：wood 木灵（默认）/ dog 犬系皮肤 / custom 自定义图片（需 skinUrl 同时到位） */
  variant: { type: String, default: 'wood' },
  /** 换装（M3 槽位制）：{ hat, scarf, bow } 槽位 → 物品 id（如 'hat-beret' / 'hat-none'） */
  wear: { type: Object, default: () => ({ hat: 'hat-none', scarf: 'scarf-none', bow: 'bow-none' }) },
  /** 自定义形象图片地址（objectURL；空串 = 无自定义形象） */
  skinUrl: { type: String, default: '' },
})

/* 自定义形象模式：variant=custom 且图片地址就绪且未加载失败（失败自动回落 SVG 形象） */
const imgBroken = ref(false)
watch(() => props.skinUrl, () => { imgBroken.value = false })
const isCustom = computed(() => props.variant === 'custom' && !!props.skinUrl && !imgBroken.value)

/* 微表情 → CSS token 串（[data-micros~="token"] 匹配） */
const microStr = computed(() =>
  Object.entries(props.micro)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(' ')
)

/* ---- 眨眼：随机 2.6~4.8s，sleep/眯眼期间不眨 ---- */
const blinking = ref(false)
let blinkTimer = null
let blinkOffTimer = null

function scheduleBlink() {
  blinkTimer = setTimeout(() => {
    if (props.state !== 'sleep' && !props.micro.eyesClosed && !props.micro.eyesWide) {
      blinking.value = true
      blinkOffTimer = setTimeout(() => { blinking.value = false }, 140)
    }
    scheduleBlink()
  }, 2600 + Math.random() * 2200)
}

/* ---- 爱心特效：action==='jumpJoy' 时冒 3 颗 ---- */
const hearts = ref([])
let heartSeq = 0

watch(
  () => props.action,
  (a) => {
    if (a === 'jumpJoy') {
      const batch = Array.from({ length: 3 }, (_, i) => ({
        id: ++heartSeq,
        left: 25 + Math.random() * 50,
        top: 60 + Math.random() * 30,
        delay: i * 0.12,
      }))
      hearts.value.push(...batch)
      const ids = new Set(batch.map((b) => b.id))
      setTimeout(() => {
        hearts.value = hearts.value.filter((h) => !ids.has(h.id))
      }, 1600)
    }
  }
)

/* ---- 眼睛跟随鼠标（仅桌面 hover 设备；sleep/闭眼时归零，rAF 节流） ---- */
const svgEl = ref(null)
const eyeShift = reactive({ x: 0, y: 0 })
const eyeStyle = computed(() =>
  eyeShift.x || eyeShift.y ? { transform: `translate(${eyeShift.x}px, ${eyeShift.y}px)` } : null
)
let eyeRaf = 0
const canHover = typeof window !== 'undefined' &&
  window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches

function onEyeMove(e) {
  if (eyeRaf) return
  eyeRaf = requestAnimationFrame(() => {
    eyeRaf = 0
    const el = svgEl.value
    if (!el) return
    if (props.state === 'sleep' || props.micro.eyesClosed) return
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height * 0.42          // 脸部高度
    const dx = e.clientX - cx
    const dy = e.clientY - cy
    const dist = Math.hypot(dx, dy) || 1
    const k = Math.min(1, dist / 240) * 1.8     // 最大 ±1.8px（豆豆眼不出戏）
    eyeShift.x = +((dx / dist) * k).toFixed(2)
    eyeShift.y = +((dy / dist) * k).toFixed(2)
  })
}

watch(
  () => [props.state, props.micro.eyesClosed],
  ([st, ec]) => {
    if (st === 'sleep' || ec) { eyeShift.x = 0; eyeShift.y = 0 }
  }
)

onMounted(scheduleBlink)
onMounted(() => {
  if (canHover) addEventListener('mousemove', onEyeMove, { passive: true })
})
onUnmounted(() => {
  clearTimeout(blinkTimer)
  clearTimeout(blinkOffTimer)
  if (eyeRaf) cancelAnimationFrame(eyeRaf)
  if (canHover) removeEventListener('mousemove', onEyeMove)
})
</script>
