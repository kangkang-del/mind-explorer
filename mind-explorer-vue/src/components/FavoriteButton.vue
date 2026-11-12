<template>
  <button
    @click.prevent="onClick"
    :class="variant === 'full'
      ? 'inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 rounded-full text-[13px] border transition ' + (faved ? 'border-[#f0a868] bg-[#fff3e0] text-[#D87945]' : 'border-[#E6EAF0] text-[#5A6B7C] hover:border-[#f0a868]')
      : 'fav-hit inline-flex items-center justify-center w-8 h-8 rounded-full transition ' + (faved ? 'text-[#D87945]' : 'text-[#b9c4cf] hover:text-[#D87945]')"
    :title="faved ? '取消收藏' : '收藏'"
    :aria-pressed="faved"
  >
    <span class="text-[16px] leading-none">♥</span>
    <span v-if="variant === 'full'">{{ faved ? '已收藏' : '收藏' }}</span>
  </button>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useFavorites } from '../composables/useFavorites'
import { useAuthStore } from '../stores/auth'

const props = defineProps({
  type: { type: String, required: true },        // moment | post | card | quote
  id: { type: [String, Number], required: true },
  title: String,
  summary: String,
  link: String,
  variant: { type: String, default: 'icon' },      // icon | full
})

const auth = useAuthStore()
const { state, ensureLoaded, toggle } = useFavorites()
const faved = computed(() => state.favs.has(`${props.type}:${props.id}`))

onMounted(() => ensureLoaded())

async function onClick() {
  if (!auth.currentUser) {
    // 未登录：唤起全局登录/注册弹窗（游客注册 或 GitHub），不再强制跳 GitHub
    auth.openLogin('register')
    return
  }
  await ensureLoaded()
  await toggle(props.type, props.id, { title: props.title, summary: props.summary, link: props.link })
}
</script>

<style scoped>
/* 图标态：视觉尺寸保持 32px（卡片头部放 44 会挤），
   但把可点区域扩到 44×44，手指够得着。 */
.fav-hit {
  position: relative;
}
.fav-hit::after {
  content: '';
  position: absolute;
  inset: -6px;
  border-radius: 9999px;
}
</style>
