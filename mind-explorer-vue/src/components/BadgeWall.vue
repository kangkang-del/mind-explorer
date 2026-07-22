<template>
  <div>
    <!-- 概览 -->
    <div class="flex items-center justify-between mb-3">
      <p class="text-[13px] text-[#9aa6b2] m-0">
        已点亮 <span class="font-bold text-[#e07a3f]">{{ earnedCount }}</span> / {{ totalCount }} 枚徽章
      </p>
      <div class="flex gap-1">
        <span
          v-for="t in tiers"
          :key="t.key"
          class="w-2 h-2 rounded-full"
          :style="{ background: t.color }"
          :title="t.label"
        ></span>
      </div>
    </div>

    <!-- 徽章网格 -->
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div
        v-for="b in badges"
        :key="b.id"
        class="relative p-4 rounded-2xl border text-center transition"
        :class="b.earned ? 'border-transparent shadow-sm' : 'border-[#eef2f7] bg-[#f7f9fb]'"
        :style="b.earned ? earnedStyle(b.tier) : {}"
      >
        <div
          class="text-[30px] leading-none mb-1.5"
          :class="b.earned ? '' : 'opacity-35 grayscale'"
        >{{ b.emoji }}</div>
        <p
          class="text-[13.5px] font-semibold m-0"
          :class="b.earned ? 'text-white' : 'text-[#5a6b7c]'"
        >{{ b.name }}</p>
        <p
          class="text-[11px] mt-0.5 m-0 leading-snug"
          :class="b.earned ? 'text-white/80' : 'text-[#9aa6b2]'"
        >{{ b.desc }}</p>

        <!-- 未解锁：进度条 -->
        <div v-if="!b.earned" class="mt-2">
          <div class="h-1.5 rounded-full bg-[#eef2f7] overflow-hidden">
            <div
              class="h-full rounded-full bg-[#7c9cb8] transition-all"
              :style="{ width: Math.round(b.progress * 100) + '%' }"
            ></div>
          </div>
          <p class="text-[10.5px] text-[#9aa6b2] mt-1 m-0">{{ Math.min(b.value, b.goal) }} / {{ b.goal }}</p>
        </div>
        <!-- 已解锁：角标 -->
        <span
          v-else
          class="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded-full bg-white/25 text-white"
        >已解锁</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  badges: { type: Array, default: () => [] },
})

const earnedCount = computed(() => props.badges.filter((b) => b.earned).length)
const totalCount = computed(() => props.badges.length)

const TIER = {
  bronze: { from: '#c9a27e', to: '#e0b98f' },
  silver: { from: '#8fa3b8', to: '#b6c6d6' },
  gold: { from: '#e0a85a', to: '#f0c777' },
}
const tiers = [
  { key: 'bronze', label: '铜', color: '#e0b98f' },
  { key: 'silver', label: '银', color: '#b6c6d6' },
  { key: 'gold', label: '金', color: '#f0c777' },
]

function earnedStyle(tier) {
  const c = TIER[tier] || TIER.bronze
  return { background: `linear-gradient(135deg, ${c.from}, ${c.to})` }
}
</script>
