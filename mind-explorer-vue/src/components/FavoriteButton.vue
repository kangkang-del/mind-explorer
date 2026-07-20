<template>
  <button
    @click.prevent="onClick"
    :class="variant === 'full'
      ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] border transition ' + (faved ? 'border-[#f0a868] bg-[#fff3e0] text-[#e07a3f]' : 'border-[#eef2f7] text-[#9aa6b2] hover:border-[#f0a868]')
      : 'inline-flex items-center justify-center w-8 h-8 rounded-full transition ' + (faved ? 'text-[#e07a3f]' : 'text-[#b9c4cf] hover:text-[#e07a3f]')"
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
    auth.login()
    return
  }
  await ensureLoaded()
  await toggle(props.type, props.id, { title: props.title, summary: props.summary, link: props.link })
}
</script>
