<template>
  <main class="max-w-3xl mx-auto px-4 py-6">
    <header class="mb-5">
      <h1 class="text-2xl font-bold text-[#3a4a5c] m-0">🧰 自助工具箱</h1>
      <p class="text-[#9aa6b2] text-[14px] mt-1 m-0">当情绪翻涌时，这里有几件可以马上做的小事。挑一个，慢慢来。</p>
    </header>

    <!-- 当你很难受时：紧急资源卡 -->
    <section class="rounded-2xl border border-[#f0a868] bg-[#fff8f1] p-5 mb-6">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-[20px]">🌿💛</span>
        <h2 class="text-[16px] font-bold text-[#a85a2c] m-0">当你很难受时，这里有人接住你</h2>
      </div>
      <p class="text-[13px] text-[#7a5a44] leading-7 m-0 mb-3">
        你不需要一个人扛着这些。寻求帮助不是软弱，而是对自己温柔的勇气。如果可以，请让专业的人陪你走一段：
      </p>
      <ul class="text-[13px] text-[#5a3a24] space-y-1.5 mb-3">
        <li v-for="h in hotlines" :key="h.tel">· {{ h.name }}：<b>{{ h.tel }}</b></li>
      </ul>
      <p class="text-[12px] text-[#a85a2c] m-0 mb-3">⚠️ 若你或他人正面临紧急危险，请立即拨打 <b>120</b> 或前往最近医院急诊，或拨打 <b>110</b>。</p>
      <RouterLink to="/companion" class="inline-block px-5 py-2 bg-gradient-to-r from-[#7c9cb8] to-[#a8c3d6] text-white rounded-xl text-[14px] font-semibold no-underline hover:opacity-90 transition">
        现在就和「小木」聊聊
      </RouterLink>
    </section>

    <!-- 呼吸练习 -->
    <section class="mb-6">
      <h2 class="text-[16px] font-bold text-[#3a4a5c] mb-3 m-0">🌬️ 呼吸练习</h2>
      <div class="grid sm:grid-cols-3 gap-3 mb-4">
        <div
          v-for="(ex, key) in exercises"
          :key="key"
          class="bg-white rounded-2xl border p-4 transition"
          :class="breathing.active === key ? 'border-[#7c9cb8] shadow-sm' : 'border-[#eef2f7]'"
        >
          <h3 class="text-[14px] font-semibold text-[#3a4a5c] m-0 mb-1">{{ ex.name }}</h3>
          <p class="text-[12px] text-[#9aa6b2] leading-6 m-0 mb-3">{{ ex.desc }}</p>
          <button
            @click="startBreathing(key)"
            class="w-full py-2 rounded-lg text-[13px] font-semibold transition"
            :class="breathing.active === key && breathing.running
              ? 'bg-[#eef2f7] text-[#5a6b7c]'
              : 'bg-[#f0f4f9] text-[#5a6b7c] hover:bg-[#e3ebf2]'"
          >
            {{ breathing.active === key && breathing.running ? '暂停' : (breathing.active === key ? '继续' : '开始练习') }}
          </button>
        </div>
      </div>

      <!-- 呼吸动画 -->
      <div v-if="breathing.active" class="bg-white rounded-2xl border border-[#eef2f7] p-6 flex flex-col items-center">
        <p class="text-[15px] font-semibold text-[#3a4a5c] m-0 mb-1">{{ exercises[breathing.active].name }}</p>
        <p class="text-[13px] text-[#9aa6b2] m-0 mb-5">{{ currentPhase?.label }}</p>
        <div class="relative w-[180px] h-[180px] flex items-center justify-center mb-4">
          <div
            class="absolute w-[120px] h-[120px] rounded-full bg-gradient-to-br from-[#a8d5ba] to-[#7c9cb8] opacity-80"
            :style="{ transform: 'scale(' + ringScale + ')', transitionDuration: (currentPhase?.sec || 4) + 's' }"
          ></div>
          <span class="relative text-[34px] font-bold text-white tabular-nums">{{ breathing.remaining }}</span>
        </div>
        <button @click="stopBreathing" class="text-[13px] text-[#9aa6b2] hover:text-[#e07a3f] transition">结束</button>
      </div>
    </section>

    <!-- 5-4-3-2-1 接地练习 -->
    <section class="mb-6">
      <h2 class="text-[16px] font-bold text-[#3a4a5c] mb-2 m-0">🌿 5-4-3-2-1 接地练习</h2>
      <p class="text-[13px] text-[#9aa6b2] m-0 mb-3">当思绪飘远或陷入慌乱，用五感把注意力轻轻拉回此刻。一项项写下来，不用赶。</p>
      <div class="space-y-3">
        <div v-for="(step, si) in groundSteps" :key="si" class="bg-white rounded-2xl border border-[#eef2f7] p-4">
          <p class="text-[14px] font-semibold text-[#3a4a5c] m-0 mb-1">
            {{ step.count }} 样你此刻能{{ step.sense }}的
          </p>
          <p class="text-[12px] text-[#9aa6b2] m-0 mb-2">{{ step.hint }}</p>
          <div class="space-y-2">
            <input
              v-for="i in step.count"
              :key="i"
              v-model="groundInputs[si][i - 1]"
              :placeholder="'第 ' + i + ' 项…'"
              class="w-full px-3 py-2 border border-[#e0e6ec] rounded-xl text-[14px] focus:outline-none focus:border-[#7c9cb8]"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- 蝴蝶拥抱 -->
    <section class="bg-white rounded-2xl border border-[#eef2f7] p-5">
      <h2 class="text-[16px] font-bold text-[#3a4a5c] mb-2 m-0">🦋 蝴蝶拥抱</h2>
      <p class="text-[14px] text-[#5a6b7c] leading-7 m-0">
        双臂交叉抱住自己，左右手轻搭在对侧肩膀，像蝴蝶扇翅一样<strong class="text-[#3a4a5c]">左右交替轻拍</strong>。
        配合缓慢的呼吸，持续约 1–2 分钟。这是一种双侧刺激，常能在强烈的情绪里帮你一点点找回稳定感。
      </p>
    </section>
  </main>
</template>

<script setup>
import { reactive, ref, computed, onBeforeUnmount } from 'vue'

// 危机资源（与同行者危机弹窗保持一致）
const hotlines = [
  { name: '全国 24 小时心理援助热线', tel: '400-161-9995' },
  { name: '北京心理危机研究与干预中心', tel: '010-82951332' },
  { name: '青少年心理咨询热线', tel: '12355' },
]

// —— 呼吸练习 ——
const exercises = {
  '478': {
    name: '4-7-8 安眠呼吸',
    desc: '吸气 4 秒、屏息 7 秒、呼气 8 秒，帮身体慢下来，也更容易入睡。',
    phases: [
      { label: '吸气', sec: 4, scale: 1.6 },
      { label: '屏息', sec: 7, scale: 1.6 },
      { label: '呼气', sec: 8, scale: 1 },
    ],
  },
  box: {
    name: '箱式呼吸',
    desc: '吸—屏—呼—屏各 4 秒，像画出一只方盒，稳住慌乱的节奏。',
    phases: [
      { label: '吸气', sec: 4, scale: 1.6 },
      { label: '屏息', sec: 4, scale: 1.6 },
      { label: '呼气', sec: 4, scale: 1 },
      { label: '屏息', sec: 4, scale: 1 },
    ],
  },
  calm: {
    name: '平静呼吸',
    desc: '吸气 4 秒、呼气 6 秒。延长呼气能激活副交感神经，让心跳放缓。',
    phases: [
      { label: '吸气', sec: 4, scale: 1.6 },
      { label: '呼气', sec: 6, scale: 1 },
    ],
  },
}

const breathing = reactive({ active: null, phaseIndex: 0, remaining: 0, running: false })
let timer = null
const currentPhase = computed(() => (breathing.active ? exercises[breathing.active].phases[breathing.phaseIndex] : null))
const ringScale = computed(() => (currentPhase.value ? currentPhase.value.scale : 1))

function startBreathing(key) {
  if (breathing.active === key && breathing.running) {
    pauseBreathing()
    return
  }
  if (breathing.active !== key) {
    breathing.active = key
    breathing.phaseIndex = 0
    breathing.remaining = exercises[key].phases[0].sec
  }
  breathing.running = true
  clearInterval(timer)
  timer = setInterval(tick, 1000)
}
function tick() {
  breathing.remaining -= 1
  if (breathing.remaining <= 0) {
    const phases = exercises[breathing.active].phases
    breathing.phaseIndex = (breathing.phaseIndex + 1) % phases.length
    breathing.remaining = phases[breathing.phaseIndex].sec
  }
}
function pauseBreathing() {
  breathing.running = false
  clearInterval(timer)
}
function stopBreathing() {
  breathing.running = false
  breathing.active = null
  breathing.phaseIndex = 0
  breathing.remaining = 0
  clearInterval(timer)
}

// —— 5-4-3-2-1 接地 ——
const groundSteps = [
  { count: 5, sense: '看见', hint: '环顾四周，说出 5 样你能看见的东西' },
  { count: 4, sense: '触摸', hint: '4 样你能触摸到的东西（桌角、衣料、温水…）' },
  { count: 3, sense: '听见', hint: '3 种你能听见的声音' },
  { count: 2, sense: '闻到', hint: '2 种你能闻到的气味' },
  { count: 1, sense: '尝到', hint: '1 种你能尝到的味道' },
]
const groundInputs = reactive(groundSteps.map((s) => Array(s.count).fill('')))

onBeforeUnmount(() => clearInterval(timer))
</script>
