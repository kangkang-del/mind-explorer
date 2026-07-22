<template>
  <Teleport to="body">
    <div
      v-if="store.newlyEarned.length"
      class="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4"
      @click.self="store.dismissNew()"
    >
      <div class="w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl text-center">
        <p class="text-[15px] font-bold text-[#3a4a5c] m-0">🎉 解锁新成就</p>
        <p class="text-[12.5px] text-[#9aa6b2] mt-1 mb-4 m-0">
          你刚刚点亮了 {{ store.newlyEarned.length }} 枚徽章
        </p>

        <div class="space-y-2.5 mb-5">
          <div
            v-for="b in store.newlyEarned"
            :key="b.id"
            class="flex items-center gap-3 p-3 rounded-2xl text-left"
            :style="{ background: tierBg(b.tier) }"
          >
            <span class="text-[32px] leading-none">{{ b.emoji }}</span>
            <div class="flex-1">
              <p class="text-[14px] font-bold text-white m-0">{{ b.name }}</p>
              <p class="text-[11.5px] text-white/85 m-0 leading-snug">{{ b.desc }}</p>
            </div>
          </div>
        </div>

        <button
          @click="store.dismissNew()"
          class="w-full py-2.5 bg-gradient-to-r from-[#7c9cb8] to-[#a8c3d6] text-white rounded-xl text-[14px] font-semibold hover:opacity-90 transition"
        >
          太棒了
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { useBadgeStore } from '../stores/badges'

const store = useBadgeStore()

const TIER = {
  bronze: 'linear-gradient(135deg,#c9a27e,#e0b98f)',
  silver: 'linear-gradient(135deg,#8fa3b8,#b6c6d6)',
  gold: 'linear-gradient(135deg,#e0a85a,#f0c777)',
}
function tierBg(tier) {
  return TIER[tier] || TIER.bronze
}
</script>
