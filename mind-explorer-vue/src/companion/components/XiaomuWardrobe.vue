<template>
  <Transition name="xm-drawer">
    <div
      v-if="open"
      ref="panelEl"
      class="xm-wardrobe"
      :style="panelShift ? { transform: `translate(calc(-50% + ${panelShift}px), 0)` } : {}"
      @pointerdown.stop
      @click.stop
    >
      <div class="xm-wd-head">
        <span class="xm-wd-title">{{ topTitle }}</span>
        <span v-if="top === 'wear'" class="xm-wd-days">陪伴第 {{ wd.activeDays.value }} 天</span>
        <button type="button" class="xm-wd-close" aria-label="关闭面板" @click="emit('close')">×</button>
      </div>

      <!-- 一级导航（M5-3 穿戴/模型；M6-1 加「声音」） -->
      <div class="xm-wd-top">
        <button
          v-for="t in tops" :key="t.key" type="button"
          class="xm-wd-topbtn" :class="{ 'is-active': top === t.key }"
          @click="top = t.key"
        >{{ t.name }}</button>
      </div>

      <!-- ===== 穿戴（原衣柜内容，M3 起） ===== -->
      <template v-if="top === 'wear'">
      <div class="xm-wd-tabs">
        <button
          v-for="s in slots" :key="s.key" type="button"
          class="xm-wd-tab" :class="{ 'is-active': slot === s.key }"
          @click="slot = s.key"
        >{{ s.name }}</button>
      </div>

      <div class="xm-wd-grid">
        <button
          v-for="it in slotItems" :key="it.id" type="button"
          class="xm-wd-item"
          :class="{ 'is-worn': worn === it.id, 'is-locked': !unlocked(it.id) }"
          @click="pick(it)"
        >
          <span class="xm-wd-name">{{ it.name }}</span>
          <span class="xm-wd-cond">{{ condText(it) }}</span>
        </button>
      </div>

      <!-- 我的形象（M3 批次 J）：上传 / 预览 / 清除，图片只存本机 IndexedDB -->
      <div v-if="slot === 'variant'" class="xm-wd-mine">
        <div class="xm-wd-mine-title">我的形象</div>
        <div v-if="skin.hasSkin.value" class="xm-wd-mine-row">
          <img class="xm-wd-thumb" :src="skin.url.value" alt="我的形象预览" />
          <div class="xm-wd-mine-btns">
            <button type="button" class="xm-wd-mini xm-wd-replace" @click="pickFile">换一张</button>
            <button type="button" class="xm-wd-mini xm-wd-clear" @click="onClear">清除</button>
          </div>
        </div>
        <div v-else class="xm-wd-mine-row">
          <button type="button" class="xm-wd-upload" :disabled="skin.busy.value" @click="pickFile">
            {{ skin.busy.value ? '处理中…' : '上传图片' }}
          </button>
        </div>
        <p class="xm-wd-hint">
          {{ prefs.variant === 'custom' && skin.hasSkin.value
            ? '帽子和围巾会像贴纸一样贴在你的图片上'
            : skinHint }}
        </p>
        <p class="xm-wd-sync" :class="`is-${sync.phase.value}`">{{ syncText }}</p>
        <p v-if="skin.error.value" class="xm-wd-err">{{ skin.error.value }}</p>
        <p v-if="sync.cloudNote.value" class="xm-wd-err">{{ sync.cloudNote.value }}</p>
        <input ref="fileEl" class="xm-wd-file" type="file" accept="image/*" @change="onFile" />
      </div>
      </template>

      <!-- ===== 我的模型（M5-3，D10 并入本面板） ===== -->
      <XiaomuModelPanel v-if="top === 'model'" @register="onRegister" />

      <!-- ===== 声音（M6-1，浏览器原生播报；无身份门槛） ===== -->
      <XiaomuVoicePanel v-if="top === 'voice'" />
    </div>
  </Transition>
</template>

<script setup>
/**
 * XiaomuWardrobe —— 小木面板（M3 批次 I 换装；M5-3 并入自定义模型；M6-1 并入声音设置）
 *
 * 一级导航：穿戴 / 模型 / 声音。
 *   · 穿戴 —— 槽位 tab + 物品格子；已解锁点击即穿（写 prefs，实时生效）；
 *     锁定态灰显并显示解锁条件（保底天数差值 / 里程碑描述）。
 *     「皮肤」槽位底部为「我的形象」区（批次 J）：上传/预览/清除图片皮肤。
 *   · 模型 —— 自定义模型设置（M5-3，D10）：直接渲染 XiaomuModelPanel。
 *     门槛（D6）与请求时机由该子组件自己掌握，本文件不碰。
 *   · 声音 —— 播报设置（M6-1）：渲染 XiaomuVoicePanel。
 *     ⚠️ 与「模型」不同，**本 tab 没有身份门槛**（浏览器原生朗读零成本）；
 *     浏览器不支持朗读（D9）时整个 tab 隐藏。
 * 手机遇小木贴边时做视口 clamp（同输入条 translateX 方案）。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { SLOTS, itemsOf, unlockText } from '../core/wardrobe'
import { useXiaomuPrefs } from '../composables/useXiaomuPrefs'
import { useXiaomuWardrobe } from '../composables/useXiaomuWardrobe'
import { useXiaomuSkin } from '../composables/useXiaomuSkin'
import { useXiaomuSync } from '../composables/useXiaomuSync'
import { voiceSupported } from '../composables/useXiaomuVoice'
import { useIdentity } from '../../composables/useIdentity'
import XiaomuModelPanel from './XiaomuModelPanel.vue'   // M5-3
import XiaomuVoicePanel from './XiaomuVoicePanel.vue'   // M6-1

const props = defineProps({ open: Boolean })
const emit = defineEmits(['close'])

const prefs = useXiaomuPrefs()
const wd = useXiaomuWardrobe()   // 模块单例：XiaomuPet 已绑定 mind/onUnlock，此处共享
const skin = useXiaomuSkin()     // 模块单例：与 XiaomuPet 共享同一份图片 URL
const sync = useXiaomuSync()     // 模块单例（批次 N）：跨设备同步状态与降级提示
const ident = useIdentity()

/** 未登录时如实告知「只在本机」；登录后告知会跟着账号走 */
const skinHint = computed(() =>
  ident.userId.value
    ? '图片会跟着账号同步，换设备也能看到'
    : '图片只保存在这台设备上，登录后会跟着账号走'
)

/** 同步状态一行文案（批次 N）：让用户知道现在到底有没有存到云上 */
const syncText = computed(() => {
  if (!ident.userId.value) return '未登录 · 数据只存在这台设备'
  const p = sync.phase.value
  if (p === 'ready') return sync.lastSyncAt.value ? '已同步到账号' : '已就绪'
  if (p === 'pulling') return '正在读取云端数据…'
  if (p === 'syncing') return '正在保存到账号…'
  if (p === 'degraded') return '暂时无法同步（网络或登录状态），本机改动不会丢'
  if (p === 'error') return '同步遇到问题，稍后会自动重试'
  return '待同步'
})

/** 一级导航（M5-3 穿戴/模型；M6-1 加「声音」）——
 *  「声音」在浏览器不支持朗读时整体隐藏（D9：不支持则隐藏入口）。 */
const tops = computed(() => {
  const list = [
    { key: 'wear', name: '穿戴' },
    { key: 'model', name: '模型' },
  ]
  if (voiceSupported) list.push({ key: 'voice', name: '声音' })
  return list
})
const top = ref('wear')

const TOP_TITLE = { wear: '小木的衣柜', model: '小木的模型', voice: '小木的声音' }
const topTitle = computed(() => TOP_TITLE[top.value] || '小木')

const slots = SLOTS
const slot = ref('hat')
const slotItems = computed(() => itemsOf(slot.value))

const worn = computed(() =>
  slot.value === 'variant' ? prefs.variant : prefs.wear[slot.value]
)

function unlocked(id) {
  if (id === 'custom') return true    // 批次 J：免费开放（图片存在与否由上传区决定）
  return wd.isUnlocked(id)
}

function condText(it) {
  if (it.id === 'custom') {
    if (!skin.hasSkin.value) return '上传一张图片'
    return prefs.variant === 'custom' ? '正在使用' : '点击使用'
  }
  return unlocked(it.id) ? (it.desc || ' ') : unlockText(it, wd.activeDays.value)
}

function pick(it) {
  if (it.id === 'custom') {
    if (skin.hasSkin.value) prefs.variant = 'custom'   // 已有图片：点一下直接换上
    else pickFile()                                    // 还没有：直接进上传
    return
  }
  if (!unlocked(it.id)) return
  if (slot.value === 'variant') {
    prefs.variant = it.id
  } else {
    prefs.wear[slot.value] = it.id
  }
}

/* ---- 我的形象：上传 / 清除（批次 J） ---- */
const fileEl = ref(null)

function pickFile() {
  skin.clearError()
  if (fileEl.value) fileEl.value.click()
}

async function onFile(e) {
  const f = e.target.files && e.target.files[0]
  e.target.value = ''                 // 允许同一文件再次触发 change
  if (!f) return
  const ok = await skin.upload(f)
  if (ok) prefs.variant = 'custom'    // 上传成功立即换上
}

async function onClear() {
  // 批次 N：除了清本地，还要把云端对象一并删掉 —— 否则换个设备还能看到「已清除」的图片
  await sync.forgetSkin().catch(() => {})
  await skin.clear()
  if (prefs.variant === 'custom') prefs.variant = 'wood'
}

/** M5-3：模型面板里快速游客点「去注册」—— 先收起面板，再开注册流程（与气泡 chip 同一路径） */
function onRegister() {
  emit('close')
  ident.auth.openLogin('register')
}

/* ---- 视口 clamp（同输入条方案）----
 * ⚠️ 必须用「绝对位置」算，**不能像旧实现那样累加 dx**：
 * 本面板外壳带 `xm-drawer` 过渡（transition: transform .16s），clamp 的几次调用会落在
 * 过渡中间 → getBoundingClientRect() 拿到的是**插值中的滞后几何**；旧实现 `shift += dx`
 * 会把滞后量重复累加 → 过冲出屏。移动端实测：正确应偏移 −66px，实际累加成了 **−185px**，
 * 面板左缘被推出视口 17px（`left:-17`）。
 * 绝对式算法把「当前偏移」从计算里剔除（用 offsetParent 中心 + offsetWidth 反推未偏移左缘），
 * 因此重复调用结果一致、幂等、与过渡状态无关。
 */
const panelEl = ref(null)
const panelShift = ref(0)
function clampPanel() {
  const el = panelEl.value
  if (!el) { panelShift.value = 0; return }
  const host = el.offsetParent
  const hRect = host ? host.getBoundingClientRect() : null
  const hostLeft = hRect ? hRect.left : 0
  const hostW = host ? host.offsetWidth : (hRect ? hRect.width : 0)
  const w = el.offsetWidth
  // CSS 是 left:50% + translateX(-50%)：未偏移左缘 = 宿主中心 − 面板宽/2
  const left = hostLeft + hostW / 2 - w / 2
  const margin = 8
  let dx = 0
  if (left + w > innerWidth - margin) dx = innerWidth - margin - (left + w)
  else if (left < margin) dx = margin - left
  panelShift.value = Math.round(dx)
}
watch(() => props.open, (v) => {
  if (v) nextTick(() => { clampPanel(); requestAnimationFrame(clampPanel) })
  else panelShift.value = 0
})
addEventListener('resize', clampPanel, { passive: true })
onBeforeUnmount(() => removeEventListener('resize', clampPanel))
</script>

<style>
.xm-wardrobe {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
  width: min(280px, 82vw);
  max-height: min(56vh, 400px);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background: #fff;
  border: 1.5px solid var(--xm-line, #2b2b2b);
  border-radius: 14px;
  padding: 10px 12px 12px;
  z-index: 8;
  font-family: 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
  color: #2b2b2b;
}
.xm-wd-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }

/* 一级导航（M5-3）：穿戴 / 模型 —— 连体分段控件，与二级 pill tab 区分层次
   （一级用粉色高亮，二级用黑底白字） */
.xm-wd-top {
  display: flex; margin-bottom: 8px;
  border: 1px solid var(--xm-line, #2b2b2b);
  border-radius: 999px; overflow: hidden;
}
.xm-wd-topbtn {
  flex: 1;
  border: none; background: #fff;
  color: #2b2b2b; opacity: .55;
  font-size: 11px; line-height: 1; padding: 6px 0;
  cursor: pointer; font-family: inherit;
}
.xm-wd-topbtn.is-active { background: #ffd6e7; opacity: 1; }
.xm-wd-title { font-size: 13px; font-weight: 600; flex: 1; }
.xm-wd-days { font-size: 11px; opacity: .55; white-space: nowrap; }
.xm-wd-close {
  border: none; background: #f0ece2; color: #2b2b2b;
  width: 22px; height: 22px; border-radius: 999px;
  font-size: 13px; line-height: 1; cursor: pointer; padding: 0;
}
.xm-wd-tabs { display: flex; gap: 5px; margin-bottom: 8px; }
.xm-wd-tab {
  flex: 1;
  border: 1px solid var(--xm-line, #2b2b2b);
  background: #fff; color: #2b2b2b;
  border-radius: 999px;
  font-size: 11px; line-height: 1; padding: 5px 0;
  cursor: pointer; opacity: .65;
  font-family: inherit;
}
.xm-wd-tab.is-active { background: #2b2b2b; color: #fff; opacity: 1; }
.xm-wd-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.xm-wd-item {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  border: 1.5px solid var(--xm-line, #2b2b2b);
  background: #fff; color: #2b2b2b;
  border-radius: 10px;
  padding: 7px 4px 5px;
  cursor: pointer;
  font-family: inherit;
}
.xm-wd-item.is-worn { background: #ffd6e7; }
.xm-wd-item.is-locked { opacity: .45; cursor: default; }
.xm-wd-name { font-size: 12px; line-height: 1.2; }
.xm-wd-cond { font-size: 10px; line-height: 1.3; opacity: .6; text-align: center; }

/* 我的形象（批次 J）：上传 / 预览 / 清除 */
.xm-wd-mine { margin-top: 9px; padding-top: 8px; border-top: 1px dashed #d8d2c6; }
.xm-wd-mine-title { font-size: 11px; opacity: .55; margin-bottom: 6px; }
.xm-wd-mine-row { display: flex; align-items: center; gap: 8px; }
.xm-wd-thumb {
  width: 42px; height: 42px; flex: none;
  object-fit: contain;
  background: #f7f4ee;
  border: 1px solid var(--xm-line, #2b2b2b);
  border-radius: 9px;
}
.xm-wd-mine-btns { display: flex; gap: 6px; }
.xm-wd-mini, .xm-wd-upload {
  border: 1px solid var(--xm-line, #2b2b2b);
  background: #fff; color: #2b2b2b;
  border-radius: 999px;
  font-size: 11px; line-height: 1;
  padding: 6px 11px;
  cursor: pointer;
  font-family: inherit;
}
.xm-wd-upload { width: 100%; padding: 8px 0; }
.xm-wd-mini:hover, .xm-wd-upload:hover { background: #f0ece2; }
.xm-wd-upload:disabled { opacity: .5; cursor: default; }
.xm-wd-hint { font-size: 10px; line-height: 1.4; opacity: .5; margin: 6px 0 0; }
.xm-wd-sync { font-size: 10px; line-height: 1.4; margin: 3px 0 0; opacity: .5; }
.xm-wd-sync.is-ready { color: #4d7c0f; opacity: .8; }
.xm-wd-sync.is-degraded, .xm-wd-sync.is-error { color: #c2410c; opacity: .85; }
.xm-wd-err { font-size: 10px; line-height: 1.4; margin: 4px 0 0; color: #c2410c; }
.xm-wd-file { display: none; }
</style>
