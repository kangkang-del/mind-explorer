<template>
  <Teleport to="body">
    <div
      v-if="crisis.open"
      class="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4"
      @click.self="crisis.close()"
    >
      <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#f0a868]">
        <div class="text-[24px] mb-2">🌿💛</div>
        <h3 class="text-lg font-bold text-[#3a4a5c] m-0 mb-2">你值得被好好接住</h3>
        <p class="text-[13px] text-[#5a6b7c] leading-7 m-0 mb-3">
          我听到了你此刻很重的疲惫，也很心疼。想轻轻告诉你：你不需要一个人扛着这些。
          寻求帮助不是软弱，而是对自己温柔的勇气。如果可以，请让专业的人陪你走一段：
        </p>
        <ul class="text-[13px] text-[#3a4a5c] space-y-1.5 mb-3">
          <li v-for="h in HOTLINES" :key="h.number">· {{ h.name }}：<b>{{ h.number }}</b></li>
        </ul>
        <p class="text-[12px] text-[#a85a2c] m-0 mb-4">
          ⚠️ 若你正面临紧急危险，请立即拨打 <b>120</b> 或前往最近医院急诊，或拨打 <b>110</b>。
        </p>

        <!-- 信任联系人 -->
        <div class="rounded-xl bg-[#f7f9fb] p-3 mb-4">
          <p class="text-[13px] font-semibold text-[#3a4a5c] m-0 mb-2">🤝 你的信任联系人</p>
          <ul v-if="contacts.contacts.length" class="space-y-1.5">
            <li v-for="c in contacts.contacts" :key="c.id" class="flex items-center justify-between text-[13px]">
              <span class="text-[#3a4a5c]">
                {{ c.name }}<span v-if="c.relation" class="text-[#9aa6b2]">（{{ c.relation }}）</span>
              </span>
              <a v-if="c.phone" :href="'tel:' + c.phone" class="text-[#7c9cb8] no-underline font-medium">📞 {{ c.phone }}</a>
              <span v-else class="text-[#9aa6b2]">未留电话</span>
            </li>
          </ul>
          <p v-else class="text-[12px] text-[#9aa6b2] m-0">
            还没有设置。在
            <RouterLink to="/profile" class="text-[#7c9cb8] no-underline" @click="crisis.close()">个人中心</RouterLink>
            添加信任的人，危机时更容易伸手。
          </p>
        </div>

        <div class="flex gap-2">
          <RouterLink
            to="/companion"
            @click="crisis.close()"
            class="flex-1 py-2.5 bg-gradient-to-r from-[#7c9cb8] to-[#a8c3d6] text-white rounded-lg text-[14px] font-semibold hover:opacity-90 transition text-center no-underline"
          >
            继续和小木聊聊
          </RouterLink>
          <button
            @click="crisis.close()"
            class="px-4 py-2.5 rounded-lg text-[14px] text-[#5a6b7c] border border-[#e0e6ec] hover:bg-[#f0f4f9] transition"
          >
            我记住了
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { useCrisisStore } from '../stores/crisisStore'
import { useTrustedContactsStore } from '../stores/trustedContacts'
import { HOTLINES } from '../lib/crisis'

const crisis = useCrisisStore()
const contacts = useTrustedContactsStore()
</script>
