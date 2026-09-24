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
        <span class="xm-wd-title">小木的衣柜</span>
        <span class="xm-wd-days">陪伴第 {{ wd.activeDays.value }} 天</span>
        <button type="button" class="xm-wd-close" aria-label="关闭衣柜" @click="emit('close')">×</button>
      </div>

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
    </div>
  </Transition>
</template>

<script setup>
/**
 * XiaomuWardrobe —— 换装面板（M3 批次 I，任务 I2）
 *
 * 槽位 tab + 物品格子；已解锁点击即穿（写 prefs，实时生效）；
 * 锁定态灰显并显示解锁条件（保底天数差值 / 里程碑描述）。
 * 手机遇小木贴边时做视口 clamp（同输入条 translateX 方案）。
 * 「皮肤」槽位底部为「我的形象」区（批次 J）：上传/预览/清除图片皮肤（IndexedDB 本地存储）。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { SLOTS, itemsOf, unlockText } from '../core/wardrobe'
import { useXiaomuPrefs } from '../composables/useXiaomuPrefs'
import { useXiaomuWardrobe } from '../composables/useXiaomuWardrobe'
import { useXiaomuSkin } from '../composables/useXiaomuSkin'
import { useXiaomuSync } from '../composables/useXiaomuSync'
import { useIdentity } from '../../composables/useIdentity'

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

/* ---- 视口 clamp（同输入条方案）：按当前 shift 做增量修正，多次调用收敛 ---- */
const panelEl = ref(null)
const panelShift = ref(0)
function clampPanel() {
  const el = panelEl.value
  if (!el) { panelShift.value = 0; return }
  const r = el.getBoundingClientRect()   // 已含当前 shift，因此 dx 是「还差多少」
  const margin = 8
  let dx = 0
  if (r.right > innerWidth - margin) dx = innerWidth - margin - r.right
  else if (r.left < margin) dx = margin - r.left
  panelShift.value = Math.round(panelShift.value + dx)
}
watch(() => props.open, (v) => {
  if (v) nextTick(() => { clampPanel(); requestAnimationFrame(() => { clampPanel(); requestAnimationFrame(clampPanel) }) })
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
