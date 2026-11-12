<template>
  <section
    ref="rootEl"
    class="page-read flex flex-col h-[calc(100dvh-180px)]"
    :style="chatH ? { height: chatH + 'px' } : undefined"
  >
    <!-- 小木角色卡 -->
    <header class="flex items-center gap-3 mb-3 shrink-0">
      <div class="w-[52px] h-[52px] rounded-full bg-gradient-to-br from-[#a8d5ba] to-[#7c9cb8] flex items-center justify-center text-[26px] shrink-0">🌿</div>
      <div class="flex-1">
        <h1 class="text-xl font-bold text-[#263746] m-0 leading-tight">同行者·小木</h1>
        <p class="text-[12px] text-[#5A6B7C] m-0">
          <span v-if="emotionLabel">此刻你似乎{{ emotionLabel }}{{ emotionEmoji }}</span>
          <span v-else>研究心理学与哲学的同行者，随时陪你聊聊</span>
        </p>
      </div>
      <RouterLink
        to="/companion/story"
        class="text-[12px] min-h-[44px] min-w-[44px] justify-center px-3 py-1.5 rounded-full border border-[#e6efe9] bg-white text-[#5a8a6a] hover:border-[#a8cbb4] hover:bg-[#f5faf7] transition no-underline flex items-center gap-1 shrink-0"
        title="小木记得的你 —— 它把记得的事，一段段讲给你听"
      >
        <span aria-hidden="true">📖</span><span class="hidden md:inline">故事书</span>
      </RouterLink>
      <!-- M6-1：播报开关（D9：浏览器不支持朗读时隐藏） -->
      <button
        v-if="voiceSupported"
        type="button"
        data-xm="voiceToggle"
        class="text-[12px] min-h-[44px] min-w-[44px] justify-center px-2.5 py-1.5 rounded-full border transition shrink-0 flex items-center gap-1"
        :class="prefs.voiceOn
          ? 'border-[#e7a8c2] bg-[#fdeef5] text-[#b0446f]'
          : 'border-[#e6efe9] bg-white text-[#5A6B7C] hover:border-[#a8cbb4]'"
        :title="prefs.voiceOn ? '小木会把回复读出来（点此关闭）' : '让小木把回复读出来'"
        :aria-label="prefs.voiceOn ? '关闭朗读' : '开启朗读'"
        @click="toggleVoice"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M11 5 6 9H3v6h3l5 4V5z" />
          <path v-if="prefs.voiceOn" d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path v-if="prefs.voiceOn" d="M18.5 6a9 9 0 0 1 0 12" />
          <line v-if="!prefs.voiceOn" x1="4" y1="20" x2="20" y2="4" />
        </svg>
        <span class="hidden md:inline">{{ prefs.voiceOn ? '朗读中' : '朗读' }}</span>
      </button>
      <button v-if="messages.length" @click="clearChat" class="border-0 text-[12px] text-[#5A6B7C] hover:text-[#D87945] transition px-2 py-1 shrink-0">清空</button>
    </header>

    <!-- 引导入口（陪伴深度）——
         键盘弹出时整块收起：这些是「开始聊之前」的入口，
         打字时不需要，但它们会占掉 100+px，把输入框顶出可视区。 -->
    <div v-if="!compact" class="mb-2 shrink-0">
      <div v-if="showGuidesHint" class="flex items-center gap-2 bg-surface-brand-subtle rounded-xl px-3 py-1.5 mb-2">
        <span class="text-[12px] text-[#5a7d9a] leading-5 flex-1">小木准备了几件可以一起做的事，点下面试试 👇</span>
        <button @click="dismissGuidesHint" class="border-0 inline-flex items-center justify-center w-11 h-11 shrink-0 text-[#5A6B7C] hover:text-[#5a7d9a] text-[16px] leading-none">×</button>
      </div>
      <!-- 快捷功能：手机 5 项横向滚动；桌面/平板只显示常用 3 项 + 「更多」
           （手册 §4：桌面和平板使用常用 3 项 + 更多） -->
      <div class="flex flex-nowrap gap-2 overflow-x-auto no-scrollbar pb-1">
        <button
          v-for="(g, i) in guides"
          :key="g.key"
          @click="openGuide(g.key)"
          :title="g.desc"
          class="bg-transparent shrink-0 whitespace-nowrap min-h-[44px] px-3 py-1.5 rounded-full text-[12.5px] border transition flex items-center gap-1.5"
          :class="[i >= 3 ? 'md:hidden' : '', guide === g.key ? 'font-semibold shadow-sm' : 'bg-white border-[#E6EAF0] text-[#7a8a9a] hover:border-[#c5d8ea]']"
          :style="guide === g.key ? { backgroundColor: g.bg, borderColor: g.color, color: g.color } : {}"
        >
          <span class="text-[15px] leading-none">{{ g.emoji }}</span>
          <span>{{ g.label }}</span>
          <span v-if="guide === g.key" class="inline-block w-[6px] h-[6px] rounded-full" :style="{ backgroundColor: g.color }"></span>
        </button>

        <!-- 桌面/平板的「更多」 -->
        <div class="relative hidden md:block shrink-0">
          <button
            type="button"
            @click="moreGuides = !moreGuides"
            :aria-expanded="moreGuides ? 'true' : 'false'"
            class="bg-transparent inline-flex items-center gap-1 min-h-[44px] px-3 py-1.5 rounded-full text-[12.5px] border border-[#E6EAF0] text-[#5A6B7C] hover:border-[#c5d8ea] transition"
          >
            更多 <span class="text-[10px]" aria-hidden="true">▾</span>
          </button>
          <div
            v-if="moreGuides"
            class="absolute right-0 top-[calc(100%+8px)] z-20 min-w-[280px] bg-white border border-[#E6EAF0] rounded-xl shadow-lg p-1.5"
          >
            <button
              v-for="g in guides"
              :key="g.key"
              type="button"
              @click="openGuide(g.key)"
              class="w-full flex items-start gap-2.5 min-h-[44px] px-3 py-2 rounded-lg text-left transition hover:bg-[#f0f4f9]"
            >
              <span class="text-[17px] leading-none pt-0.5" aria-hidden="true">{{ g.emoji }}</span>
              <span class="flex-1 min-w-0">
                <span class="block text-[13px] font-semibold text-[#263746] leading-tight">{{ g.label }}</span>
                <span class="block text-[11.5px] text-[#5A6B7C] leading-snug mt-0.5">{{ g.desc }}</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 情绪命名引导（陪伴深度） -->
    <div v-if="guide === 'mood'" class="bg-white rounded-2xl border border-[#E6EAF0] p-4 mb-3 shrink-0">
      <p class="text-[13px] text-[#5a6b7c] mb-2.5 m-0">此刻，你感觉……（点一个，小木来接住你）</p>
      <div class="grid grid-cols-6 gap-2 mb-3">
        <button
          v-for="m in MOODS"
          :key="m.key"
          @click="pickEmotion(m)"
          class="bg-transparent flex flex-col items-center gap-0.5 py-2 rounded-xl border transition"
          :class="pickedEmotion === m.key ? 'border-[#345B8E] bg-surface-brand-subtle scale-[1.03]' : 'border-[#E6EAF0] hover:border-[#c5d8ea]'"
        >
          <span class="text-[22px] leading-none">{{ m.emoji }}</span>
          <span class="text-[11px] text-[#5a6b7c]">{{ m.label }}</span>
        </button>
      </div>
      <div v-if="pickedEmotion" class="flex items-center gap-2 flex-wrap">
        <input v-model="moodNote" placeholder="想给今天的心情留句话？（可选）" class="flex-1 min-w-[160px] px-3 py-2 border border-[#E6EAF0] rounded-lg text-[16px] focus:outline-none focus:border-[#345B8E] min-h-[44px]" />
        <button
          @click="logMood"
          :disabled="moodLogging"
          class="border-0 px-4 py-2 rounded-lg bg-[#345B8E] text-white text-[13px] font-semibold disabled:opacity-50 transition hover:opacity-90"
        >
          {{ moodLogging ? '记入中…' : '记入心情 + 打卡' }}
        </button>
        <span class="text-[12px] text-[#5A6B7C]">{{ moodTip }}</span>
      </div>
    </div>

    <!-- 对话区 -->
    <div class="relative flex-1 min-h-0 flex flex-col">
    <section ref="scrollEl" class="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-[#FAFBFD] border border-[#E6EAF0] p-4 space-y-3" @scroll.passive="onMsgScroll">
      <!-- 每日主动陪伴语（P5-2）：当天首次访问显示，可关闭 -->
      <div v-if="greeting" class="flex items-start gap-2 bg-gradient-to-r from-[#fff7ec] to-[#fef2f5] border border-[#f6dcc4] rounded-2xl px-4 py-3">
        <span class="text-[20px] shrink-0">🌅</span>
        <p class="flex-1 text-[13.5px] text-[#7a6a58] leading-7 m-0">{{ greeting }}</p>
        <button @click="dismissGreeting" class="border-0 text-[#b9a890] hover:text-[#8a7a66] text-[18px] leading-none shrink-0" aria-label="关闭">×</button>
      </div>

      <!-- 欢迎语 -->
      <div v-if="!messages.length" class="text-center text-[#5A6B7C] text-[14px] leading-8 py-10">
        <p>🌿 我是小木，一个研究心理学与哲学的同行者。这里没有对错，只有被认真听见的你。</p>
        <p>随便说点什么，或试着聊聊今天的心情。</p>
      </div>

      <!-- 消息气泡 -->
      <div
        v-for="(m, i) in messages"
        :key="i"
        class="flex"
        :class="m.role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <!-- 内层容器：小木的消息要能「气泡 + 画面」纵向叠放。
             用户消息用 display:contents —— 子元素直接成为外层 flex 的项，
             布局与改动前逐像素一致（justify-end 仍然生效）。 -->
        <div :class="m.role === 'user' ? 'contents' : 'flex flex-col items-start gap-2 w-full min-w-0'">
        <!-- 复盘周报卡片（陪伴深度） -->
        <div v-if="m.type === 'recap'" class="max-w-[90%] bg-white border border-[#e6efe9] rounded-2xl rounded-bl-sm p-4">
          <div class="flex items-center gap-2 mb-2.5">
            <span class="text-[16px]">📊</span>
            <b class="text-[14px] text-[#263746]">本周情绪复盘</b>
            <span class="ml-auto text-[11px] text-[#5A6B7C]">{{ m.recap?.count || 0 }} 条记录</span>
          </div>
          <div class="flex flex-wrap gap-1.5 mb-2.5">
            <span class="px-2 py-0.5 rounded-full text-[11.5px] bg-[#eef4f9] text-[#5a7d9a]">高频 {{ m.recap?.topEmoji }} {{ moodLabelOf(m.recap?.topEmotion) }}</span>
            <span class="px-2 py-0.5 rounded-full text-[11.5px]" :class="trendChipClass(m.recap?.trend)">{{ m.recap?.trendLabel }}</span>
          </div>
          <p class="text-[13.5px] text-[#5a6b7c] leading-7 m-0">{{ m.recap?.text }}</p>
        </div>
        <!-- 文字气泡。若她「只画不说」（content 为空），整个气泡不占位 ——
             否则会留下一个空的圆角白块。 -->
        <div
          v-else
          v-show="m.content || m.thinking || !m.scene"
          class="max-w-[78%] px-4 py-2.5 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap break-words"
          :class="m.role === 'user'
            ? 'bg-[#345B8E] text-white rounded-br-sm'
            : 'bg-white border border-[#e6efe9] text-[#263746] rounded-bl-sm'"
        >
          <span v-if="m.role === 'assistant' && !m.content && m.thinking" class="text-[#5A6B7C]">小木正在听…</span>
          <span>{{ m.content }}</span>
          <span v-if="m.role === 'assistant' && m.thinking && m.content" class="inline-block w-1.5 h-4 ml-0.5 bg-[#9aa6b2] align-middle animate-blink"></span>
        </div>

        <!-- M7：她自己画的画面。只在她真的画出完整代码后才有值；
             `code` 里不含任何配文，配文仍在上面那个气泡里。 -->
        <XiaomuScene
          v-if="m.scene && m.scene.code"
          :code="m.scene.code"
          class="max-w-[78%] w-full"
          @fail="onSceneFail"
        />
        </div>
      </div>

    </section>

    <!-- 回到最新：用户翻看历史时不强行拉回，只给一个明确的归位入口。
         放在滚动容器外（绝对定位），避免按钮出现时把内容撑高、造成跳动。 -->
    <button
      v-if="!stickToBottom && messages.length"
      type="button"
      @click="jumpToLatest"
      class="absolute left-1/2 -translate-x-1/2 bottom-3 inline-flex items-center gap-1 px-3 min-h-[36px] rounded-full bg-white/95 border border-[#dfe7ef] text-[#5a6b7c] text-[12.5px] shadow-md backdrop-blur-sm hover:border-[#c5d8ea] transition"
    >
      回到最新 <span aria-hidden="true">↓</span>
    </button>
    </div>

    <!-- CBT 思维记录（陪伴深度） -->
    <div v-if="guide === 'cbt'" class="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 px-4" @click.self="guide = ''">
      <div class="bg-white rounded-2xl max-w-lg w-full p-5 shadow-xl max-h-[88vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-[16px] font-bold text-[#263746] m-0">🧠 换个角度看一看</h3>
          <button @click="guide = ''" class="border-0 text-[#5A6B7C] hover:text-[#263746] text-xl leading-none">×</button>
        </div>
        <p class="text-[12.5px] text-[#5A6B7C] leading-6 m-0 mb-3">当脑中那句反复的话让你难受，试着把它摊开，和小木一起看看它是不是全部的真相。</p>
        <div class="space-y-2.5">
          <textarea v-model="cbt.situation" rows="2" placeholder="发生了什么？（情境）" class="w-full px-3 py-2 border border-[#E6EAF0] rounded-xl text-[16px] resize-none focus:outline-none focus:border-[#345B8E] min-h-[44px]"></textarea>
          <textarea v-model="cbt.thought" rows="2" placeholder="脑中冒出的想法是……（自动思维）" class="w-full px-3 py-2 border border-[#E6EAF0] rounded-xl text-[16px] resize-none focus:outline-none focus:border-[#345B8E] min-h-[44px]"></textarea>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="m in MOODS" :key="m.key" @click="cbt.emotion = m.key"
              class="bg-transparent px-2.5 py-1 rounded-full text-[12px] border transition"
              :class="cbt.emotion === m.key ? 'border-[#345B8E] bg-surface-brand-subtle text-[#5a7d9a]' : 'border-[#E6EAF0] text-[#7a8a9a]'">
              {{ m.emoji }} {{ m.label }}
            </button>
          </div>
          <textarea v-model="cbt.evidenceFor" rows="2" placeholder="支持这个想法的证据……" class="w-full px-3 py-2 border border-[#E6EAF0] rounded-xl text-[16px] resize-none focus:outline-none focus:border-[#345B8E] min-h-[44px]"></textarea>
          <textarea v-model="cbt.evidenceAgainst" rows="2" placeholder="不支持它的证据……（哪怕一点点）" class="w-full px-3 py-2 border border-[#E6EAF0] rounded-xl text-[16px] resize-none focus:outline-none focus:border-[#345B8E] min-h-[44px]"></textarea>
          <textarea v-model="cbt.alternative" rows="2" placeholder="更平衡、更善意的想法是……" class="w-full px-3 py-2 border border-[#E6EAF0] rounded-xl text-[16px] resize-none focus:outline-none focus:border-[#345B8E] min-h-[44px]"></textarea>
        </div>
        <div class="flex items-center gap-2 mt-3">
          <button @click="submitCbtForm" :disabled="cbtLoading"
            class="border-0 flex-1 py-2.5 bg-[#345B8E] text-white rounded-lg text-[14px] font-semibold disabled:opacity-50 transition hover:opacity-90">
            {{ cbtLoading ? '小木在读…' : '请小木陪我看看' }}
          </button>
          <button @click="guide = ''" class="bg-transparent px-4 py-2.5 rounded-lg text-[14px] text-[#5a6b7c] border border-[#E6EAF0] hover:bg-surface-brand-subtle transition">稍后</button>
        </div>
      </div>
    </div>

    <!-- 睡前仪式（陪伴深度） -->
    <div v-if="guide === 'bedtime'" class="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 px-4" @click.self="guide = ''">
      <div class="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-[16px] font-bold text-[#263746] m-0">🌙 睡前一刻</h3>
          <button @click="guide = ''" class="border-0 text-[#5A6B7C] hover:text-[#263746] text-xl leading-none">×</button>
        </div>
        <p class="text-[13px] text-[#5a6b7c] leading-7 m-0 mb-3">
          先把注意力放到呼吸上，慢慢吸气、慢慢呼气。然后从脚到头，感受身体一点点松弛下来，把今天的重量交给床。
        </p>
        <p class="text-[13px] text-[#5a6b7c] m-0 mb-2">今天，有三件让你有一点点暖的小事吗？</p>
        <div class="space-y-2 mb-4">
          <input v-for="i in 3" :key="i" v-model="bedtime.gratitude[i - 1]" :placeholder="'第 ' + i + ' 件小确幸…'" class="w-full px-3 py-2 border border-[#E6EAF0] rounded-xl text-[16px] focus:outline-none focus:border-[#345B8E] min-h-[44px]" />
        </div>
        <button @click="finishBedtime" class="border-0 w-full py-2.5 bg-[#345B8E] text-white rounded-lg text-[14px] font-semibold hover:opacity-90 transition">
          完成 · 和小木说晚安
        </button>
      </div>
    </div>

    <!-- 我的思录（CBT 历史回看，陪伴深度） -->
    <div v-if="guide === 'cbt-history'" class="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 px-4" @click.self="guide = ''">
      <div class="bg-white rounded-2xl max-w-lg w-full p-5 shadow-xl max-h-[85vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-[16px] font-bold text-[#263746] m-0">📖 我的思录</h3>
          <button @click="guide = ''" class="border-0 text-[#5A6B7C] hover:text-[#263746] text-xl leading-none">×</button>
        </div>
        <p v-if="!cbtHistory.length" class="text-[13px] text-[#5A6B7C] py-6 text-center m-0">还没有思维记录。做完一次「换个角度看」，这里会留下你的思录，方便回看。</p>
        <div v-else class="space-y-3">
          <div v-for="(r, idx) in cbtHistory" :key="idx" class="border border-[#E6EAF0] rounded-xl p-3">
            <div class="flex items-center gap-2 mb-1.5">
              <span class="text-[11px] text-[#5A6B7C]">{{ fmtCbtTime(r.at) }}</span>
              <span v-if="r.emotion" class="text-[11px] px-1.5 py-0.5 rounded-full bg-[#eef4f9] text-[#5a7d9a]">{{ moodLabelOf(r.emotion) }}</span>
              <button @click="deleteCbtRecord(idx)" class="border-0 ml-auto text-[11px] text-[#b8c2cc] hover:text-[#D87945] transition">删除</button>
            </div>
            <p v-if="r.thought" class="text-[13px] text-[#263746] m-0 mb-1"><b>想法：</b>{{ r.thought }}</p>
            <p v-if="r.alternative" class="text-[13px] text-[#4a8a5e] m-0 mb-1"><b>更平衡：</b>{{ r.alternative }}</p>
            <p v-if="r.suggestion" class="text-[12.5px] text-[#5a6b7c] leading-6 m-0 mt-1.5 pt-1.5 border-t border-line-subtle">小木：{{ r.suggestion }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 输入区 -->
    <div class="mt-3 shrink-0">
      <!-- M6-2c：语音输入状态条（录音中显示波形；提示态可关闭） -->
      <Transition name="xm-iat-fade">
        <div
          v-if="iat.visible.value"
          class="xm-iat-bar"
          :class="{ 'is-live': iat.live.value, 'is-warn': iat.warn.value }"
          data-xm="iatBar"
        >
          <span class="xm-iat-dot" aria-hidden="true"></span>
          <span class="xm-iat-msg" data-xm="iatMsg">{{ iat.uiText.value }}</span>
          <span v-if="iat.live.value" class="xm-iat-wave" aria-hidden="true">
            <i v-for="n in 5" :key="n" :style="{ height: waveHeight(n) }"></i>
          </span>
          <button
            v-if="iat.dismissible.value"
            type="button" class="xm-iat-x" aria-label="关闭提示"
            @click="iat.dismiss()"
          >×</button>
        </div>
      </Transition>

      <footer class="flex items-end gap-2 shrink-0">
        <!-- M6-2c：真 PTT（按住说话 / 松开发送）。⚠️ 只在用户于「声音」面板开启后出现 -->
        <button
          v-if="pttSupported"
          ref="pttBtnEl"
          type="button"
          data-xm="pttBtn"
          class="xm-ptt"
          :class="{ 'is-live': iat.live.value, 'is-near': iat.modifiers.value.nearLimit }"
          :aria-label="iat.pttLabel.value"
          :title="iat.pttLabel.value + '（聚焦后也可按住空格）'"
          @pointerdown.prevent="onPttDown"
          @pointerup.prevent="onPttUp"
          @pointercancel.prevent="onPttUp"
          @pointerleave="onPttUp"
          @keydown.space.prevent="onPttKeyDown"
          @keyup.space.prevent="onPttKeyUp"
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0" />
            <line x1="12" y1="18" x2="12" y2="22" />
          </svg>
          <span class="hidden md:inline">{{ iat.pttLabel.value }}</span>
        </button>
        <textarea
          ref="inputEl"
          v-model="input"
          rows="1"
          @keydown.enter.exact.prevent="send"
          placeholder="和小木说点什么…"
          class="flex-1 max-h-32 px-4 py-3 border border-[#E6EAF0] rounded-2xl resize-none text-[16px] focus:outline-none focus:border-[#345B8E] min-h-[44px]"
        ></textarea>
        <button
          @click="send"
          :disabled="!input.trim() || sending"
          class="border-0 px-5 py-3 bg-[#345B8E] text-white rounded-2xl text-[14px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition hover:opacity-90 shrink-0"
        >
          {{ sending ? '…' : '发送' }}
        </button>
      </footer>
    </div>
  </section>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { companionApi } from '../api/companion'
import { moodApi } from '../api/mood'
import { checkinsApi } from '../api/checkins'
import { useAuthStore } from '../stores/auth'
import { useBadgeStore } from '../stores/badges'
import { useCrisisStore } from '../stores/crisisStore'
import { detectCrisis, crisisReply } from '../lib/crisis'
import { useIdentity } from '../composables/useIdentity'
// M6-1：语音播报（浏览器原生，零成本）。与桌宠共用同一份 prefs 与播报队列。
import { useXiaomuPrefs } from '../companion/composables/useXiaomuPrefs'
import { useXiaomuVoice, voiceSupported } from '../companion/composables/useXiaomuVoice'
// M6-2c：语音输入（按住说话）。⚠️ 模块级单例 —— 与桌宠入口共享同一状态机与同一条 WS。
import { useXiaomuIat } from '../companion/composables/useXiaomuIat'
// 2026-11-06：功能可见性总开关（讯飞三要素未配 ⇒ 暂时不露出语音输入入口）
import { IAT_UI_ENABLED } from '../companion/core/features'
// 视口高度与键盘状态：聊天页高度按真实可见高度算，而不是 100vh
import { viewportHeight, keyboardOpen, bindViewport } from '../composables/useViewport'
// M7：她自己画东西 —— 流式切分器（纯 reducer）+ 卡片 + 全局开关
import { createSceneStream } from '../companion/core/sceneStream'
import { useScenePref } from '../composables/useScenePref'
import XiaomuScene from '../companion/components/XiaomuScene.vue'

const auth = useAuthStore()
const badgesStore = useBadgeStore()
const crisisStore = useCrisisStore()
// 批次 M1：身份规则收敛到 useIdentity（唯一真源 src/lib/identity.js）。
// 保留同名别名，使下方既有调用点无需逐个改写。
const ident = useIdentity()
const userId = ident.userId
const userNickname = ident.nickname

// M6-1：语音播报
const prefs = useXiaomuPrefs()
const voice = useXiaomuVoice()
// M6-2c：语音输入
const iat = useXiaomuIat()
// M7：小木能不能自己画东西（默认开）。关掉时不告诉她 —— 后端不注入能力块。
const { sceneEnabled } = useScenePref()

/**
 * PTT 入口是否出现：**功能对外开启 && 麦克风能力 && 用户已开启**。
 * ⚠️ 与 D9（不支持则隐藏入口）同规则；`voiceSupported` 与语音输入无关，不参与本判据。
 * 🔴 加 `IAT_UI_ENABLED` 是给「老用户 localStorage 里 iatOn 仍为 true」兜底 ——
 *    只看 prefs 会让下线后仍然冒出入口，一按就报「功能尚未启用」。
 */
const pttSupported = computed(() => IAT_UI_ENABLED && iat.supported && !!prefs.iatOn)

/* ---------------- M6-2c：按住说话 ---------------- */

let pttKeyHeld = false

function onPttDown() {
  if (!pttSupported.value) return
  iat.press({ onResult: applyTranscript })
}
function onPttUp() { iat.release() }

/** 空格键：keydown 会**自动重复** ⇒ 必须自己防抖，否则会反复 press */
function onPttKeyDown() {
  if (pttKeyHeld) return
  pttKeyHeld = true
  onPttDown()
}
function onPttKeyUp() {
  pttKeyHeld = false
  onPttUp()
}

/**
 * 转写结果只**写进输入框**，不自动发送（用户要能改）。
 * 🔴 写的是字符串 ref `input`（不是 textarea 的 `inputEl`）—— v-model 会自动同步视图；
 *    手动 `inputEl.value = …` + 派发 input 事件会绕开 Vue。
 */
function applyTranscript(t) {
  const s = String(t == null ? '' : t).trim()
  if (!s) return
  input.value = input.value ? input.value + s : s
  nextTick(() => { try { inputEl.value && inputEl.value.focus() } catch { /* 静默 */ } })
}

/** 波形条高度（纯展示；录音时的音量反馈） */
function waveHeight(n) {
  const lv = Math.max(0, Math.min(1, Number(iat.level.value) || 0))
  const base = 3 + lv * 14
  const wobble = [1, 0.55, 0.85, 0.5, 1][n - 1] || 0.7
  return `${Math.round(base * wobble)}px`
}

/** 是否允许现在出声：支持 + 开启 + 非免打扰（D5） */
function voiceAllowed() {
  return voiceSupported && prefs.voiceOn && !prefs.dnd
}

/** 念一句小木的话（打断上一条；空文本/占位符不念） */
function speakReply(text) {
  if (!voiceAllowed()) return false
  const t = String(text == null ? '' : text).trim()
  if (!t || t === '……') return false
  return voice.speak(t, { voiceURI: prefs.voiceURI, rate: prefs.voiceRate })
}

function toggleVoice() {
  const on = !prefs.voiceOn
  prefs.voiceOn = on
  if (on) {
    voice.loadVoices()
    speakReply('嗯，我可以说话了。')
  } else {
    voice.stop()
  }
}

/** 免打扰一开 → 立刻闭嘴（与桌宠同规则） */
watch(() => prefs.dnd, (on) => { if (on) voice.stop() })

const STORAGE_KEY = 'xiaomu_history_v1'
const MAX_HISTORY = 12
/**
 * M7：历史里最多保留几张「画面」。
 * 一张画面 2–3KB，比一条文字贵 10 倍以上。不设上限的话，12 条 ×3KB 虽然还塞得下，
 * 但 localStorage setItem 抛 QuotaExceeded 时是**整条历史一起存不下** ——
 * 为了一张旧画面丢掉整段对话，不值得。超出的只留文字。
 */
const MAX_SCENE_HISTORY = 6

const input = ref('')
const sending = ref(false)
const messages = reactive(loadHistory())
const scrollEl = ref(null)
const rootEl = ref(null)
// 聊天页高度（px）。0 表示还没量到，此时用 CSS 的 100dvh 兜底。
const chatH = ref(0)
// 空间吃紧（键盘弹出、横屏矮视口）——收起引导区，把地方让给消息和输入框。
// 用「量出来的高度」判断，而不是只看键盘信号：
// Android 键盘会让布局视口一起缩小，keyboardOpen 判不出来，但高度一定会变小。
const compact = computed(() => chatH.value > 0 && chatH.value < 420)
const inputEl = ref(null)
const pttBtnEl = ref(null)   // M6-2c：PTT 按钮（留给验收用 data-xm 定位；ref 便于聚焦）
const emotionLabel = ref('')
const emotionEmoji = ref('')
const greeting = ref('')
const GREETING_KEY = 'xiaomu_greeting_date'
let controller = null

// —— 陪伴深度：引导模块 ——
const MOODS = [
  { key: 'anxious', label: '焦虑', emoji: '😟' },
  { key: 'low', label: '低落', emoji: '🌧️' },
  { key: 'angry', label: '愤怒', emoji: '😣' },
  { key: 'lost', label: '迷茫', emoji: '🌫️' },
  { key: 'calm', label: '平静', emoji: '🍃' },
  { key: 'grateful', label: '温暖', emoji: '🌤️' },
]
const guides = [
  { key: 'mood', emoji: '🌤️', label: '此刻心情', desc: '点一个情绪，小木来接住你，并可记入今天的心情', color: '#345B8E', bg: '#F0F4F9' },
  { key: 'recap', emoji: '📊', label: '本周复盘', desc: '基于近7天心情，小木陪你回顾这一周', color: '#5a8a6a', bg: '#e6efe9' },
  { key: 'cbt', emoji: '🧠', label: '换个角度看', desc: 'CBT思维记录，和小木一起做认知重构', color: '#9a6ab5', bg: '#f3eef8' },
  { key: 'bedtime', emoji: '🌙', label: '睡前一刻', desc: '入睡前的小小收尾仪式', color: '#4a6a8a', bg: '#eef4fa' },
  { key: 'cbt-history', emoji: '📖', label: '我的思录', desc: '回看过去的思维记录', color: '#9a7a4a', bg: '#faf3e6' },
]
const guide = ref('')
// 桌面/平板快捷项的「更多」面板
const moreGuides = ref(false)
const pickedEmotion = ref('')
const moodTip = ref('')
const moodLogging = ref(false)
const cbt = reactive({ situation: '', thought: '', emotion: '', evidenceFor: '', evidenceAgainst: '', alternative: '' })
const cbtLoading = ref(false)
const bedtime = reactive({ gratitude: ['', '', ''] })
const moodNote = ref('')
const cbtHistory = ref([])
const showGuidesHint = ref(false)
const CBT_STORE_KEY = 'cbt_records_v1'

const moodLabelOf = (k) => (MOODS.find((m) => m.key === k)?.label) || k
const trendChipClass = (t) => (t === 'low' ? 'bg-[#fdecea] text-[#c0654a]' : t === 'bright' ? 'bg-[#e8f5ec] text-[#4a8a5e]' : 'bg-[#eef2f7] text-[#7a8a9a]')

function loadCbtRecords() {
  try {
    const arr = JSON.parse(localStorage.getItem(CBT_STORE_KEY) || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
function saveCbtRecord(record) {
  try {
    const arr = loadCbtRecords()
    arr.unshift(record)
    localStorage.setItem(CBT_STORE_KEY, JSON.stringify(arr.slice(0, 50)))
  } catch {
    /* 忽略 */
  }
}
function deleteCbtRecord(idx) {
  const arr = loadCbtRecords()
  arr.splice(idx, 1)
  try { localStorage.setItem(CBT_STORE_KEY, JSON.stringify(arr)) } catch {}
  cbtHistory.value = arr
}
function fmtCbtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function dismissGuidesHint() {
  showGuidesHint.value = false
  try { localStorage.setItem('companion_guides_hint', '1') } catch {}
}

function openGuide(key) {
  moreGuides.value = false
  if (key === 'recap') {
    guide.value = ''
    loadRecap()
    return
  }
  if (key === 'cbt-history') {
    cbtHistory.value = loadCbtRecords()
  }
  guide.value = guide.value === key ? '' : key
}

// 情绪命名：点亮情绪 + 以「我感到{label}」触发小木回应
async function pickEmotion(m) {
  pickedEmotion.value = m.key
  emotionLabel.value = m.label
  emotionEmoji.value = m.emoji
  moodTip.value = ''
  await sendText(`我感到${m.label}`)
}

// 记入今天的心情 + 打卡（与 Mood.vue 一致）
async function logMood() {
  if (!userId.value) {
    moodTip.value = '请先登录后再记录'
    return
  }
  if (!pickedEmotion.value) return
  moodLogging.value = true
  moodTip.value = ''
  const res = await moodApi.add(userId.value, pickedEmotion.value, moodNote.value.trim(), ident.token())
  moodLogging.value = false
  if (res.ok) {
    moodTip.value = '已记入今天的心情 + 打卡 ✓'
    moodNote.value = ''
    checkinsApi.checkin({ userId: userId.value, source: 'mood' }).catch(() => {})
    badgesStore.refresh(userId.value).catch(() => {})
  } else {
    moodTip.value = res.reason || '记录失败，稍后再试'
  }
}

// 以打字机方式追加一条小木气泡（用于复盘 / CBT / 睡间的非流式结果）
async function pushAssistant(text) {
  sending.value = true
  activeAssistant = reactive({ role: 'assistant', content: '', thinking: true })
  messages.push(activeAssistant)
  await scrollToBottom(true)
  activeAssistant.thinking = false
  for (const ch of text) {
    activeAssistant.content += ch
    if ('，。、；：！？\n'.includes(ch)) await new Promise((r) => setTimeout(r, 40))
    scrollToBottom()
  }
  sending.value = false
  saveHistory()
  speakReply(text)   // M6-1：复盘/CBT/睡前这类非流式回复，打完后也念出来
}

// 本周情绪复盘（结构化卡片）
async function loadRecap() {
  if (!userId.value) {
    await pushAssistant('先登录后，小木才能陪你看看这一周的心情～')
    return
  }
  const data = await companionApi.getRecap(userId.value, ident.token())
  if (!data.ok) {
    await pushAssistant('小木暂时没能调出记录，稍后再试试。')
    return
  }
  if (data.empty || !data.recap) {
    await pushAssistant('这几天还没有心情记录呢。先去「心情日记」留几笔，小木才能陪你复盘～')
    return
  }
  messages.push({ role: 'assistant', type: 'recap', recap: data.recap })
  await scrollToBottom(true)
  saveHistory()
}

// CBT 思维记录提交
async function submitCbtForm() {
  if (!cbt.thought.trim()) return
  guide.value = ''
  cbtLoading.value = true
  await pushAssistant('你愿意把这件心事摊开来看，已经很勇敢了。我慢慢读……')
  const data = await companionApi.submitCbt({
    situation: cbt.situation,
    thought: cbt.thought,
    emotion: cbt.emotion,
    evidenceFor: cbt.evidenceFor,
    evidenceAgainst: cbt.evidenceAgainst,
    alternative: cbt.alternative,
  })
  cbtLoading.value = false
  const rec = { situation: cbt.situation, thought: cbt.thought, emotion: cbt.emotion, evidenceFor: cbt.evidenceFor, evidenceAgainst: cbt.evidenceAgainst, alternative: cbt.alternative }
  Object.assign(cbt, { situation: '', thought: '', emotion: '', evidenceFor: '', evidenceAgainst: '', alternative: '' })
  if (data.ok && data.suggestion) {
    saveCbtRecord({ ...rec, suggestion: data.suggestion, at: new Date().toISOString() })
    badgesStore.refresh(userId.value).catch(() => {})
    await pushAssistant(data.suggestion)
  } else {
    await pushAssistant('小木暂时走神了，稍后再陪你看看好吗？')
  }
}

// 睡前仪式完成
async function finishBedtime() {
  guide.value = ''
  localStorage.setItem('bedtime_done_v1', '1')
  if (userId.value) checkinsApi.checkin({ userId: userId.value, source: 'practice' }).catch(() => {})
  badgesStore.refresh(userId.value).catch(() => {})
  const g = bedtime.gratitude.map((x) => x.trim()).filter(Boolean)
  let line = '晚安。今天你为自己留出了这一刻安静，已经很了不起了。'
  if (g.length) line += `\n你记下的${g.length}件小确幸——${g.join('、')}——就让它们陪你入梦吧。`
  line += '\n慢慢呼吸，把一天的重量轻轻放下。我在这里，明天见。🌙'
  bedtime.gratitude = ['', '', '']
  await pushAssistant(line)
}

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}
// 仅在「当天首次访问」拉取一次陪伴语，避免每次进页面都打扰
async function loadGreeting() {
  if (!userId.value) return
  try {
    if (localStorage.getItem(GREETING_KEY) === todayKey()) return
    const data = await companionApi.getGreeting(userId.value, ident.token())
    if (data?.ok && data.greeting) {
      greeting.value = data.greeting
      localStorage.setItem(GREETING_KEY, todayKey())
    }
  } catch {
    /* 忽略：陪伴语是锦上添花，失败不影响主流程 */
  }
}
function dismissGreeting() {
  greeting.value = ''
}

// 当前助手消息的引用，用于流式追加
let activeAssistant = null

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function saveHistory() {
  try {
    // 仅持久化已完成（非 thinking）的消息；保留复盘卡片的结构化数据
    const toSave = messages
      .filter((m) => !m.thinking)
      .map((m) => {
        const o = { role: m.role, content: m.content || '' }
        if (m.type) o.type = m.type
        if (m.type === 'recap' && m.recap) o.recap = m.recap
        // M7：画面存进历史（下次打开还在），但 content 里永远没有代码，
        // 所以 getHistory() 回传给模型的上下文天然干净。
        if (m.scene && m.scene.code) o.scene = { code: m.scene.code }
        return o
      })
      .slice(-MAX_HISTORY * 2)

    // 从新往旧数，超过上限的只留文字
    let kept = 0
    for (let i = toSave.length - 1; i >= 0; i--) {
      if (!toSave[i].scene) continue
      if (++kept > MAX_SCENE_HISTORY) delete toSave[i].scene
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
  } catch {
    /* 忽略存储异常 */
  }
}

/**
 * 按「真实可见高度」算聊天页高度。
 *
 * 不用 calc(100vh - 220px) 这类魔数：220 是照着当时的顶栏和间距手填的，
 * 之后加了移动底栏、改了留白，这个数就再也不对了。
 * 这里改成实测：可见高度 - 顶栏 - main 上下内边距 - 底栏高度。
 */
function measureChatHeight() {
  const el = rootEl.value
  if (!el || typeof window === 'undefined') return
  const nav = document.querySelector('header.sticky')
  const navH = nav ? nav.getBoundingClientRect().height : 60
  const main = el.closest('main')
  let padT = 0
  let padB = 0
  if (main) {
    const cs = getComputedStyle(main)
    padT = parseFloat(cs.paddingTop) || 0
    padB = parseFloat(cs.paddingBottom) || 0
  }
  // 底栏是 fixed，会盖住视口底部；键盘弹出时它会被隐藏（高度归 0）
  const tab = document.querySelector('nav[aria-label="底部导航"]')
  const tabH = tab ? tab.getBoundingClientRect().height : 0
  const vh = viewportHeight.value || window.innerHeight
  // 下限 240：给输入区和两条消息的余地。不能再高 ——
  // 键盘弹出时可见高度可能只剩 300 出头，下限过高会把输入框顶到视口外。
  chatH.value = Math.max(240, Math.round(vh - navH - padT - padB - tabH))
}

// 是否跟随新消息。用户往上翻看历史时置 false，不再把他拽回底部。
const stickToBottom = ref(true)
const NEAR_BOTTOM_PX = 80

function onMsgScroll() {
  const el = scrollEl.value
  if (!el) return
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight
  stickToBottom.value = distance <= NEAR_BOTTOM_PX
}

/**
 * force = true：无条件滚到底（自己刚发的消息、刚打开页面）
 * force = false：只有用户本来就在底部附近才跟随（流式增量、打字机）
 */
async function scrollToBottom(force = false) {
  await nextTick()
  const el = scrollEl.value
  if (!el) return
  if (!force && !stickToBottom.value) return
  el.scrollTop = el.scrollHeight
  stickToBottom.value = true
}

function jumpToLatest() {
  scrollToBottom(true)
}

function clearChat() {
  if (!confirm('确定清空与小木的对话记录吗？')) return
  messages.splice(0, messages.length)
  emotionLabel.value = ''
  emotionEmoji.value = ''
  saveHistory()
  // 同步清空服务端记忆（若已登录且启用）
  if (userId.value) companionApi.clearHistory(userId.value, ident.token())
}

function getHistory() {
  // 取最近若干条已完成消息作为上下文（复盘卡片以其文字摘要参与上下文）
  return messages
    .filter((m) => !m.thinking)
    .map((m) => ({ role: m.role, content: m.type === 'recap' ? (m.recap?.text || '') : m.content }))
    .slice(-MAX_HISTORY)
}

/**
 * M7：画面被挡下时的观测点。
 * 三种原因：审计不过（可能是 prompt 约束失效）、10s 没有首帧（多半是死循环/画错了）、
 * 以及以后可能加的其他闸。上线后要盯的就是这个计数 —— 它持续变高说明
 * 模型在写「我们不敢给他跑」的代码，此时该改 prompt，而不是放宽闸门。
 */
function onSceneFail(reason) {
  console.warn('[M7] scene dropped:', reason)
}

async function send() {
  const text = input.value.trim()
  if (!text || sending.value) return
  input.value = ''
  await sendText(text)
}

// 以指定文本触发一次小木对话（供「情绪命名」等引导模块复用）
async function sendText(text) {
  if (!text || sending.value) return
  voice.stop()   // M6-1：用户又开口了 → 掐断上一句播报

  messages.push({ role: 'user', content: text })
  sending.value = true
  await scrollToBottom(true)

  // 助手占位（流式填充）
  activeAssistant = reactive({ role: 'assistant', content: '', thinking: true, scene: null })
  messages.push(activeAssistant)

  // M7：每个回复一个切分器。它对全量 raw 重算，所以 content 里永远只有「人话」；
  // 代码单独走 reducer 内部，等流结束再决定要不要成卡片。
  const sceneSt = createSceneStream()
  await scrollToBottom(true)

  const history = getHistory().slice(0, -1) // 不含刚加的用户消息已在后端拼

  controller = companionApi.streamChat({
    message: text,
    history,
    userId: userId.value,
    nickname: userNickname.value,
    authToken: ident.token(),
    // M7：只认严格 true。开关关着 ⇒ 后端**不注入能力块**，她根本不知道自己能画。
    allowScene: sceneEnabled.value === true,
    onMeta: (meta) => {
      if (meta.emotion) {
        emotionLabel.value = meta.emotion.label || ''
        emotionEmoji.value = meta.emotion.emoji || ''
      }
      if (meta.crisis) crisisStore.open()
    },
    onDelta: (chunk) => {
      activeAssistant.thinking = false
      // 只有 text 进气泡。代码部分被 reducer 扣住，一个字都不会出现在气泡里。
      activeAssistant.content = sceneSt.push(chunk).text
      scrollToBottom()
    },
    onError: async (msg) => {
      voice.stop()   // M6-1：出错就别说话了
      // 服务不可用（如本地 dev 无函数 / 404）时，前端本地降级为模板语录
      if (isServiceUnavailable(msg)) {
        await localFallback(text)
      } else {
        activeAssistant.thinking = false
        activeAssistant.content += `\n〔小木暂时走神了：${msg}〕`
      }
    },
    onDone: () => {
      activeAssistant.thinking = false

      // 🔴 finish() 必须在取最终值之前。reducer 会「按住」不确定的尾巴
      //    （被拆帧的反引号、还没看够的 "<"），不 finish 直接读会丢字。
      const s = sceneSt.finish()
      activeAssistant.content = s.text

      // 成卡片的条件：开关开着、代码完整（围栏闭合 **或** 无围栏兜底命中）、没超体积。
      // 半截代码渲染出来就是「画错了」，宁可不出。
      // 审计由组件自己做（闸在渲染层，因为它是可复用组件）。
      if (sceneEnabled.value && s.code && (s.closed || s.noFence) && !s.overflow) {
        activeAssistant.scene = { code: s.code }
      }

      sending.value = false
      saveHistory()
      speakReply(activeAssistant.content)   // M6-1：回完就念出来。content 已经是纯文字
    },
  })
}

// 判断是否为「服务不可用」类错误（用于本地降级）
function isServiceUnavailable(msg) {
  return !msg || /Failed to fetch|404|NetworkError|HTTP 4|load failed/i.test(msg)
}

// 本地降级：与后端一致的规则，逐字模拟打字机（无需后端/key 即可对话）
function localDetect(text) {
  const crisis = detectCrisis(text)
  let emotion = { label: '平静', emoji: '🍃' }
  const rules = [
    { label: '有些焦虑', emoji: '😟', words: ['焦虑', '紧张', '害怕', '担心', '慌', '不安', '压力', '睡不着', '失眠'] },
    { label: '有些低落', emoji: '🌧️', words: ['难过', '伤心', '低落', '抑郁', '累', '疲惫', '孤独', '空虚', '失落', '想哭'] },
    { label: '有些愤怒', emoji: '😣', words: ['生气', '愤怒', '烦', '讨厌', '气死', '恨', '委屈'] },
    { label: '有些迷茫', emoji: '🌫️', words: ['迷茫', '不知道', '怎么办', '没有方向', '困惑', '纠结'] },
    { label: '有些温暖', emoji: '🌤️', words: ['谢谢', '感谢', '开心', '幸福', '幸运', '温暖', '喜欢', '爱'] },
  ]
  for (const r of rules) {
    if (r.words.some((w) => text.includes(w))) {
      emotion = { label: r.label, emoji: r.emoji }
      break
    }
  }
  return { crisis, emotion }
}

function localReply(text, crisis, emotion) {
  if (crisis) return crisisReply()
  if (emotion.label.includes('焦虑')) return '深呼吸一下。你担心的事里，哪一件占的分量最重？'
  if (emotion.label.includes('低落')) return '你愿意说说看，是从什么时候开始觉得这么沉的吗？'
  if (emotion.label.includes('愤怒')) return '这件事让你不舒服，你的感受是有道理的。最让你难受的是哪一点？'
  if (emotion.label.includes('迷茫')) return '在分岔路口站一会儿也没关系的。你心里有没有一点点偏向的方向？'
  if (emotion.label.includes('温暖')) return '这种暖意很难得，你值得好好收藏它。'
  return '我在听。你随便说，不用特意组织。想到什么就说什么。'
}

async function localFallback(text) {
  const { crisis, emotion } = localDetect(text)
  emotionLabel.value = emotion.label
  emotionEmoji.value = emotion.emoji
  if (crisis) crisisStore.open()
  const reply = localReply(text, crisis, emotion)
  activeAssistant.thinking = false
  for (const ch of reply) {
    activeAssistant.content += ch
    if ('，。、；：！？\n'.includes(ch)) await new Promise((r) => setTimeout(r, 45))
    scrollToBottom()
  }
  sending.value = false
  saveHistory()
  speakReply(reply)   // M6-1：本地降级语录同样念出来
}

// 挂载时：若已登录，从服务端恢复对话（跨设备连续性）；失败则保留本地 localStorage
onMounted(async () => {
  bindViewport()
  // 先把会改变高度的东西都定下来，再测量、再归位。
  // 顺序反了的话：测量时还没有引导提示，等它插进来就凭空多出 ~48px，
  // 滚动位置会差一截，看起来像「没滚到底」。
  try {
    if (!localStorage.getItem('companion_guides_hint')) showGuidesHint.value = true
  } catch {}
  await nextTick()
  measureChatHeight()
  // 本地历史是同步读出来的，没有服务端那条恢复路径 —— 这里补一次归位，
  // 否则带着几十条历史进来会停在最老的那条。
  if (messages.length) await scrollToBottom(true)
  if (!userId.value) return
  const serverMsgs = await companionApi.getHistory(userId.value, ident.token())
  if (serverMsgs && serverMsgs.length) {
    messages.splice(0, messages.length, ...serverMsgs.map((m) => ({ role: m.role, content: m.content })))
    saveHistory()
    await scrollToBottom(true)
  }
  // 并行拉取当天的主动陪伴语（独立于对话恢复）
  loadGreeting()
})

// 视口变化（滚动导致地址栏收放）、键盘开合、旋转屏幕 ⇒ 重算高度。
// flush: 'post' 让回调在 DOM 更新后跑；再 nextTick 一次，确保底栏已被 v-if 移除。
watch([viewportHeight, keyboardOpen], async () => {
  await nextTick()
  measureChatHeight()
  // 高度变了会改变滚动位置的相对关系：本来就贴底的，重排后继续贴底
  if (stickToBottom.value) await scrollToBottom(true)
}, { flush: 'post' })

onBeforeUnmount(() => {
  controller?.abort()
  voice.stop()   // M6-1：离开页面掐断播报
  iat.reset()    // M6-2c：拆掉麦克风与 WS，别把按钮「按一半」的状态带到别的页面
})
</script>

<style scoped>
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.2; }
}
.animate-blink { animation: blink 1s step-end infinite; }

/* ===== M6-2c：语音输入（PTT）===== */
.xm-ptt {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 12px 12px;
  border-radius: 16px;
  border: 1px solid #e0e6ec;
  background: #fff;
  color: #5a7d9a;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;          /* 按住时不要触发滚动手势 */
  transition: background .15s, border-color .15s, color .15s, transform .08s;
}
.xm-ptt:hover { border-color: #c5d8ea; background: #f7fafc; }
.xm-ptt.is-live {
  border-color: #e7a8c2;
  background: #fdeef5;
  color: #b0446f;
  transform: scale(.97);
}
.xm-ptt.is-near { border-color: #f6dcc4; background: #fff7ec; color: #b07a2e; }

.xm-iat-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 7px 12px;
  border-radius: 14px;
  border: 1px solid #e6efe9;
  background: #f5faf7;
  font-size: 12.5px;
  color: #4a6b58;
  line-height: 1.4;
}
.xm-iat-bar.is-warn { border-color: #f6dcc4; background: #fff7ec; color: #8a6a3a; }
.xm-iat-msg { flex: 1; }
.xm-iat-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #a8cbb4; flex: none;
}
.xm-iat-bar.is-live .xm-iat-dot { background: #ff9ec4; animation: blink 1s ease-in-out infinite; }
.xm-iat-bar.is-warn .xm-iat-dot { background: #e7b06a; }
.xm-iat-wave { display: inline-flex; align-items: center; gap: 2px; height: 18px; flex: none; }
.xm-iat-wave i { width: 3px; border-radius: 2px; background: #ff9ec4; transition: height .09s linear; }
.xm-iat-x {
  flex: none;
  border: 0; background: transparent; color: inherit; opacity: .55;
  font-size: 16px; line-height: 1; cursor: pointer; padding: 0 2px;
}
.xm-iat-x:hover { opacity: 1; }

.xm-iat-fade-enter-active, .xm-iat-fade-leave-active { transition: opacity .16s ease, transform .16s ease; }
.xm-iat-fade-enter-from, .xm-iat-fade-leave-to { opacity: 0; transform: translateY(4px); }
</style>
