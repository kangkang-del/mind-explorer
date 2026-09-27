<template>
  <section class="bg-white rounded-2xl border border-[#f0e2e2] p-5 mb-5">
    <h2 class="text-[16px] font-bold text-[#8a5a5a] mb-2 m-0">🗑️ 删除我的全部数据</h2>
    <p class="text-[13px] text-[#9aa6b2] leading-6 m-0 mb-4">
      会删掉小木记得你的全部内容：对话记忆、用户画像、换装与解锁、自定义形象图片、心情日记。
      <strong class="text-[#8a5a5a]">删除后无法恢复。</strong>
    </p>
    <button
      type="button"
      class="text-[13px] px-4 py-2 rounded-full border border-[#e8c8c8] text-[#a86a6a] hover:bg-[#fdf6f6] transition"
      @click="openConfirm"
    >我要删除</button>
  </section>

  <!-- ── 第一段：输入昵称 ── -->
  <Transition name="purge-fade">
    <div
      v-if="step === 'confirm'"
      class="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 px-4"
      @click.self="closeConfirm"
    >
      <div class="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 max-h-[88vh] overflow-y-auto">
        <h3 class="text-[17px] font-bold text-[#3a4a5c] m-0 mb-3">删除前，请确认是你本人</h3>
        <p class="text-[13.5px] text-[#5a6b7c] leading-6 m-0 mb-4">
          请输入你的昵称 <strong class="text-[#3a4a5c]">{{ displayName || '（当前身份无昵称）' }}</strong>
          —— 输入完全一致才能继续。
        </p>
        <input
          v-model="typed"
          type="text"
          :placeholder="displayName || '请输入昵称'"
          class="w-full text-[14px] px-3.5 py-2.5 rounded-xl border transition outline-none"
          :class="typedOk ? 'border-[#a8cbb4]' : 'border-[#e0e6ec] focus:border-[#c5d8ea]'"
          @keyup.enter="typedOk && goFinal()"
        />

        <!-- 社区足迹（可选，默认不勾） -->
        <label class="flex items-start gap-2.5 mt-4 cursor-pointer select-none">
          <input type="checkbox" v-model="includeCommunity" class="mt-0.5 accent-[#7c9cb8]" />
          <span class="text-[13px] text-[#5a6b7c] leading-6">
            同时处理我在社区的足迹（帖子 / 治愈瞬间 / 评论 / 认同）
            <span class="block text-[12px] text-[#9aa6b2] mt-0.5">
              不勾选：社区内容<strong>会保留但匿名化</strong> —— 内容还在，但不再与你的昵称关联，别人也找不到是你发的。
            </span>
          </span>
        </label>

        <p v-if="errorText" class="text-[13px] text-[#c98a8a] leading-6 mt-3 mb-0">{{ errorText }}</p>

        <div class="flex items-center gap-2 mt-5">
          <button
            type="button"
            class="flex-1 text-[14px] py-2.5 rounded-full border border-[#e0e6ec] text-[#5a6b7c] hover:border-[#c5d8ea] transition"
            @click="closeConfirm"
          >取消</button>
          <button
            type="button"
            class="flex-1 text-[14px] py-2.5 rounded-full text-white font-semibold transition"
            :class="typedOk ? 'bg-[#c98a8a] hover:opacity-90' : 'bg-[#dcdcdc] cursor-not-allowed'"
            :disabled="!typedOk"
            @click="goFinal"
          >继续</button>
        </div>
      </div>
    </div>
  </Transition>

  <!-- ── 第二段：最后一道确认 ── -->
  <Transition name="purge-fade">
    <div
      v-if="step === 'final'"
      class="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 px-4"
      @click.self="step = 'confirm'"
    >
      <div class="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <h3 class="text-[17px] font-bold text-[#8a5a5a] m-0 mb-3">最后一步</h3>
        <p class="text-[13.5px] text-[#5a6b7c] leading-6 m-0 mb-4">
          删除之后，小木会忘记和你说过的所有话、记下的所有心情，以及它为你换上的每一件小配饰。
          <strong class="text-[#8a5a5a]">这一步无法撤销。</strong>
        </p>
        <label class="flex items-start gap-2.5 cursor-pointer select-none">
          <input type="checkbox" v-model="ack" class="mt-0.5 accent-[#c98a8a]" />
          <span class="text-[13.5px] text-[#5a6b7c] leading-6">我明白，删除后无法恢复</span>
        </label>

        <p v-if="errorText" class="text-[13px] text-[#c98a8a] leading-6 mt-3 mb-0">{{ errorText }}</p>

        <div class="flex items-center gap-2 mt-5">
          <button
            type="button"
            class="flex-1 text-[14px] py-2.5 rounded-full border border-[#e0e6ec] text-[#5a6b7c] hover:border-[#c5d8ea] transition"
            :disabled="busy"
            @click="step = 'confirm'"
          >再想想</button>
          <button
            type="button"
            class="flex-1 text-[14px] py-2.5 rounded-full text-white font-semibold transition"
            :class="(ack && !busy) ? 'bg-[#c98a8a] hover:opacity-90' : 'bg-[#dcdcdc] cursor-not-allowed'"
            :disabled="!ack || busy"
            @click="doPurge"
          >{{ busy ? '正在删除…' : '确认删除' }}</button>
        </div>
      </div>
    </div>
  </Transition>

  <!-- ── 告别：硬编码，不经 LLM ── -->
  <Transition name="purge-farewell">
    <div
      v-if="step === 'bye'"
      class="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-gradient-to-b from-[#fbfdfb] to-[#f2f7f3] px-6"
    >
      <div class="w-[112px] mb-5 xm-bye-pet">
        <XiaomuSvg state="happy" action="swayLeaf" variant="wood" :wear="wear" />
      </div>
      <p class="text-[17px] text-[#5a6b7c] leading-8 m-0 text-center max-w-md">
        {{ FAREWELL }}
      </p>
      <p class="text-[12.5px] text-[#b8c2cc] leading-6 mt-3 mb-6 text-center">
        你的数据已经删除了。这一页不会再记住你。
      </p>
      <RouterLink
        to="/"
        class="text-[14px] px-6 py-2.5 rounded-full bg-[#7c9cb8] text-white no-underline hover:opacity-90 transition"
        @click="leaveFarewell"
      >回到首页</RouterLink>
    </div>
  </Transition>
</template>

<script setup>
/**
 * AccountPurge —— 「彻底删除我的数据」（M4 批次 P）
 *
 * ── 三段式，每一段都有它挡的东西 ────────────────────────────────
 *   ① confirm：输昵称（精确匹配）+ 可选勾社区足迹  → 挡「手滑点进来」
 *   ② final  ：再勾一次「我明白」                   → 挡「输完昵称顺手确认」
 *   ③ bye    ：告别语（硬编码）                     → 不是确认，是收尾礼节
 *
 * 删掉「误触不可删」这条验收标准，靠的是**两道不同性质的关卡**：
 * 第一道要你**记得自己的昵称**（认知成本），第二道要你**主动勾选**（动作成本）。
 * 只有一道弹窗的「确认/取消」永远挡不住连点。
 *
 * ── 告别语为什么硬编码 ──────────────────────────────────────────
 * 决策 4：这句话必须是确定的，不能被模型改写。小木平时是 LLM 驱动的，
 * 但「告别」这件事上，一句飘忽的话比没有话更伤人 —— 所以写死在这里。
 * （同时后端也不参与：删除是纯数据操作，不调 LLM。）
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import XiaomuSvg from '../companion/components/XiaomuSvg.vue'
import { useAuthStore } from '../stores/auth'
import { useXiaomuPrefs } from '../companion/composables/useXiaomuPrefs'
import { useXiaomuSkin } from '../companion/composables/useXiaomuSkin'
import { useXiaomuSync } from '../companion/composables/useXiaomuSync'
import { xmAuth } from '../api/xiaomuAuth'
import { identifierOf } from '../lib/identity'
import { purgeAccount } from '../api/accountPurge'
import { announceFarewell, resetFarewell } from '../companion/core/farewell'

/** 告别语 —— 唯一真源，硬编码。测试会断言这里逐字为这句话 */
const FAREWELL = '朋友，再见，祝你天天开心。'

const auth = useAuthStore()
const router = useRouter()
const prefs = useXiaomuPrefs()
const skin = useXiaomuSkin()
const sync = useXiaomuSync()

const wear = computed(() => prefs.wear || { hat: 'hat-none', scarf: 'scarf-none', bow: 'bow-none' })
const displayName = computed(() => auth.displayName || '')

const step = ref('idle')          // idle | confirm | final | bye
const typed = ref('')
const includeCommunity = ref(false)
const ack = ref(false)
const busy = ref(false)
const errorText = ref('')

/** 精确匹配（trim 后全等）—— 不做「忽略大小写」这类宽容，宽容会削弱这层保护 */
const typedOk = computed(() => !!displayName.value && typed.value.trim() === displayName.value)

function openConfirm() {
  typed.value = ''
  includeCommunity.value = false
  ack.value = false
  errorText.value = ''
  step.value = 'confirm'
}

function closeConfirm() {
  step.value = 'idle'
  typed.value = ''
}

function goFinal() {
  if (!typedOk.value) return
  errorText.value = ''
  ack.value = false
  step.value = 'final'
}

async function doPurge() {
  if (!ack.value || busy.value) return
  busy.value = true
  errorText.value = ''

  const uid = identifierOf(auth.currentUser)
  const token = xmAuth.get(uid) || xmAuth.stale(uid)
  const res = await purgeAccount({
    userId: uid,
    authToken: token,
    nickname: displayName.value,
    includeCommunity: includeCommunity.value,
  })

  if (!res.ok) {
    busy.value = false
    errorText.value = res.reason === 'forbidden'
      ? '登录状态好像过期了。请重新登录一次，再试删除 —— 为了安全，删除必须由你本人发起。'
      : res.reason === 'no-token'
        ? '拿不到你的登录凭证，删除没有执行（这是保护，不是故障）。请重新登录后再试。'
        : '删除没有完成，可能网络不通。你的数据还在，稍后再试一次就好。'
    // ⚠️ 刻意留在 final 段：用户此刻正看着这个弹窗，错误就地显示、可再点一次。
    // 跳回 confirm 会让错误文案落在一段被隐藏的 DOM 里 → 用户看到「点了没反应」。
    return
  }

  // 服务端 + 本地都清干净了 → 让桌宠也知道该说再见了
  announceFarewell()
  // ⚠️ 必须先让同步引擎停手，再动皮肤状态：
  //    否则 skin.clear() 会触发 watcher → pushNow() 在删除后
  //    又把一份空快照写回 xiaomu_user_state（「刚删掉的行立刻长回来」）。
  try { sync.halt() } catch { /* 同步引擎尚未实例化时忽略 */ }
  try { skin.clear() } catch { /* 皮肤已随 IDB 删除，这里只是让内存状态归零 */ }

  // ⚠️ 身份（auth.user / auth.guest）**刻意不在这里清**。
  //    本组件挂载在 `<AccountPurge v-if="auth.currentUser" />` 下 —— 一旦此刻把身份置空，
  //    Vue 会立刻卸载本组件，`step='bye'` 的告别遮罩永远没机会渲染（实测：遮罩不出现，
  //    只有桌宠气泡还带着告别语）。所以身份归零推迟到离开告别页时（leaveFarewell）。
  busy.value = false
  step.value = 'bye'
}

/** 离开告别页 → 此刻才真正把身份落掉，并让页面回到未登录态 */
function leaveFarewell() {
  auth.user = null
  auth.guest = null
  resetFarewell()
  step.value = 'idle'
  // 强制回首页重新挂载（Profile 页在身份变化后由路由守卫接管）
  router.push('/')
}
</script>

<style scoped>
.xm-bye-pet {
  animation: xmByeBob 2.6s ease-in-out infinite;
}
@keyframes xmByeBob {
  0%, 100% { transform: translateY(0) rotate(-2deg); }
  50% { transform: translateY(-7px) rotate(2deg); }
}
@media (prefers-reduced-motion: reduce) {
  .xm-bye-pet { animation: none; }
}

.purge-fade-enter-active, .purge-fade-leave-active { transition: opacity .2s ease; }
.purge-fade-enter-from, .purge-fade-leave-to { opacity: 0; }

.purge-farewell-enter-active { transition: opacity .5s ease; }
.purge-farewell-enter-from { opacity: 0; }
</style>
