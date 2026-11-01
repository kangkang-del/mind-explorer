<template>
  <div class="xm-vc">
    <!-- D9：浏览器不支持朗读 → 整块隐藏入口，只留一句说明 -->
    <div v-if="!voice.supported" class="xm-vc-unsupported">
      <p>这个浏览器暂时不支持朗读，换一个浏览器就能听见小木说话了。</p>
    </div>

    <template v-else>
      <p class="xm-vc-lead">让小木把回复读出来 —— 用你设备自带的声音，免费、也不用联网。</p>

      <!-- 播报开关 -->
      <label class="xm-vc-switch">
        <input type="checkbox" data-xm="voiceOn" :checked="prefs.voiceOn" @change="onToggleOn($event.target.checked)" />
        <span>读出声（小木回完就念给你听）</span>
      </label>

      <!-- ===== M6-1b：音色来源（免费 / 自带 Key） =====
       产品原则：本站只提供免费的语音；付费的一律用户自带 Key。
       所以默认就是「系统音色」，不配 Key 的人**完全感知不到**这一块的存在。 -->
      <div class="xm-vc-row" :class="{ 'is-dim': !prefs.voiceOn }">
        <span class="xm-vc-label">音色来源</span>
        <label class="xm-vc-switch">
          <input
            type="radio" name="xmVoiceEngine" value="system" data-xm="voiceEngineSystem"
            :checked="prefs.voiceEngine === 'system'" :disabled="!prefs.voiceOn"
            @change="onEngine('system')"
          />
          <span>系统音色 · 免费、离线</span>
        </label>
        <label class="xm-vc-switch">
          <input
            type="radio" name="xmVoiceEngine" value="cloud" data-xm="voiceEngineCloud"
            :checked="prefs.voiceEngine === 'cloud'" :disabled="!prefs.voiceOn"
            @change="onEngine('cloud')"
          />
          <span>云端音色 · 用我自己的密钥</span>
        </label>
      </div>

      <!-- 音色 + 试听（两档共用一个下拉，选项随来源切换） -->
      <div class="xm-vc-row" :class="{ 'is-dim': !prefs.voiceOn }">
        <span class="xm-vc-label">小木的声音</span>
        <div class="xm-vc-picker">
          <select
            v-model="voiceValue" class="xm-vc-input" data-xm="voiceSelect"
            :disabled="!prefs.voiceOn || (!isCloud && !voice.voices.value.length)"
          >
            <template v-if="isCloud">
              <option v-for="v in ZHIPU_VOICES" :key="v.id" :value="v.id">{{ v.label }}</option>
            </template>
            <template v-else>
              <option value="">自动（挑一个中文音色）</option>
              <option v-for="v in sortedVoices" :key="v.uri" :value="v.uri">{{ v.label }}</option>
            </template>
          </select>
          <button
            type="button" class="xm-vc-mini" data-xm="voicePreview"
            :disabled="!prefs.voiceOn" @click="onPreview"
          >{{ playing ? '停一下' : '试听' }}</button>
        </div>
        <template v-if="!isCloud">
          <span v-if="voice.note.value" class="xm-vc-hint">{{ voice.note.value }}</span>
          <span v-else-if="!voice.voices.value.length" class="xm-vc-hint">正在读取系统音色…</span>
        </template>
      </div>

      <!-- 云端设置（只在选了云端音色时出现；没填 Key 时默认展开） -->
      <details v-if="isCloud" class="xm-vc-cloud" :open="!hasKey" data-xm="ttsCloudBox">
        <summary class="xm-vc-cloud-sum">
          云端设置 · {{ isAccount ? (accountExists ? '账号里已存密钥' : '账号里还没存密钥') : (hasKey ? '已填密钥' : '还没填密钥') }}
        </summary>

        <div class="xm-vc-row">
          <span class="xm-vc-label">接口地址</span>
          <input
            class="xm-vc-input" data-xm="ttsBaseUrl" :value="prefs.ttsBaseUrl"
            placeholder="https://open.bigmodel.cn/api/paas/v4" @change="onBase"
          />
        </div>

        <div class="xm-vc-row">
          <span class="xm-vc-label">模型</span>
          <input
            class="xm-vc-input" data-xm="ttsModel" :value="prefs.ttsModel"
            placeholder="glm-tts" @change="onModel"
          />
        </div>

        <div class="xm-vc-row">
          <span class="xm-vc-label">API Key</span>
          <div class="xm-vc-picker">
            <input
              class="xm-vc-input" type="password" data-xm="ttsKey" v-model="keyInput"
              placeholder="粘贴你自己的密钥" autocomplete="off" spellcheck="false"
            />
            <button type="button" class="xm-vc-mini" data-xm="ttsKeySave" :disabled="accountBusy" @click="onSaveKey">保存</button>
          </div>
          <span class="xm-vc-hint">
            <template v-if="isAccount">
              密钥会加密后存到你的账号（<b>换设备也能用</b>），本站只保存密文。
            </template>
            <template v-else>
              只存在这台设备的浏览器里，<b>不会上传到本站</b>。换设备或清缓存后要重填。
            </template>
          </span>
        </div>

        <div class="xm-vc-row">
          <span class="xm-vc-label">存放方式</span>
          <label class="xm-vc-switch">
            <input
              type="radio" value="local" data-xm="ttsTransportLocal"
              :checked="!isAccount" @change="onTransport('local')"
            />
            <span>只存在这台设备 · 最快</span>
          </label>
          <label class="xm-vc-switch">
            <input
              type="radio" value="account" data-xm="ttsTransportAccount"
              :checked="isAccount" @change="onTransport('account')"
            />
            <span>加密存到我的账号 · 换设备可用</span>
          </label>
          <span v-if="isAccount" class="xm-vc-hint" data-xm="ttsAccountMask">
            {{ accountExists ? `已保存：${accountMask}` : '账号里还没有保存语音密钥' }}
          </span>
        </div>

        <div class="xm-vc-picker">
          <button
            type="button" class="xm-vc-mini" data-xm="ttsTest"
            :disabled="testing || !canTest" @click="onTest"
          >{{ testing ? '测试中…' : '测试连接' }}</button>
          <button
            type="button" class="xm-vc-mini" data-xm="ttsKeyClear"
            :disabled="!canClear" @click="onClearKey"
          >{{ isAccount ? '删除账号里的密钥' : '清除密钥' }}</button>
        </div>

        <p class="xm-vc-hint" data-xm="ttsMsg" :class="{ 'is-err': msgIsErr }">{{ cloudMsg }}</p>
        <p class="xm-vc-hint">
          云端音色由你自己付费给服务商，<b>本站不收取、也不经手任何费用</b>。
          密钥在智谱开放平台（open.bigmodel.cn）注册后于「API Keys」处创建。
        </p>
      </details>

      <!-- 语速 -->
      <div class="xm-vc-row" :class="{ 'is-dim': !prefs.voiceOn }">
        <span class="xm-vc-label">语速 · {{ rateLabel }}</span>
        <input
          class="xm-vc-range" type="range" min="0.6" max="1.6" step="0.05"
          data-xm="voiceRate" :value="prefs.voiceRate" :disabled="!prefs.voiceOn"
          @input="onRate($event.target.value)"
        />
      </div>

      <!-- 主动出声（D6） -->
      <label class="xm-vc-switch" :class="{ 'is-dim': !prefs.voiceOn }">
        <input
          type="checkbox" data-xm="voiceProactive"
          :checked="prefs.voiceProactive" :disabled="!prefs.voiceOn"
          @change="prefs.voiceProactive = $event.target.checked"
        />
        <span>她主动搭话时也出声（默认只读回复）</span>
      </label>

      <!-- 免打扰联动（D5） -->
      <p class="xm-vc-note" :class="{ 'is-warn': prefs.dnd }" data-xm="voiceDndNote">
        <template v-if="prefs.dnd">免打扰开着，小木这会儿只弹字、不出声。</template>
        <template v-else>开了免打扰时，小木会安静地只弹字。</template>
      </p>
    </template>

    <!-- ===== M6-2c：语音输入（按住说话） =====
     与上面的「说出声」是**两件独立的事**：播报是「小木说」，这里是「你说的让小木听」。
     所以开关也独立（iatOn，默认关），且**不共用**朗读的可用性判据。 -->
    <div class="xm-vc-sep"></div>

    <div v-if="!iat.supported" class="xm-vc-unsupported">
      <p>这个浏览器（或当前页面）暂时用不了语音输入，换一个浏览器试试，或者在对话页打字。</p>
    </div>

    <template v-else>
      <label class="xm-vc-switch">
        <input type="checkbox" data-xm="iatOn" :checked="prefs.iatOn" @change="prefs.iatOn = $event.target.checked" />
        <span>按住说话（说完松手，转成文字填进输入框）</span>
      </label>

      <p class="xm-vc-lead">
        在对话页输入框旁，或小木头顶的 🎤 里按住说话。识别出的文字会填进输入框，
        <b>不会自动发送</b>，你可以改完再发。
      </p>

      <!-- D16：站点每日次数用完后，引导用户用自己的密钥（真入口属 M6-1b） -->
      <div class="xm-vc-key" data-xm="iatKeySlot">
        <span class="xm-vc-key-t">用自己的密钥</span>
        <span class="xm-vc-key-d">即将开放</span>
      </div>

      <p class="xm-vc-note">
        音频只在你和设备之间处理，<b>不会存到服务器</b>。识别用的密钥由站点服务端签发，
        你的浏览器拿不到它。
      </p>
    </template>
  </div>
</template>

<script setup>
/**
 * XiaomuVoicePanel —— 「声音」设置（M6-1，D10 并入小木面板）
 *
 * 与 XiaomuModelPanel 的**关键区别**：本面板**没有 D6 身份门槛**。
 * 浏览器原生朗读零成本、无需 Key、无需后端，任何用户（含未登录）都该能用。
 * 这也是开工时把语音设置从「模型面板」挪出来、单开一级 tab 的原因（见 M6-任务清单 §4.3）。
 *
 * 面板只读写本地 prefs + 调用 useXiaomuVoice，**不发任何网络请求**。
 *
 * M6-2c 追加：本面板同时承载「语音输入」（按住说话）的开关与说明。
 * ⚠️ 与播报**完全独立**：播报用 `voiceOn`、这里用 `iatOn`；可用性判据也不共用
 *    （`voice.supported` 是 speechSynthesis，`iat.supported` 是麦克风 + WS）。
 *    面板本身仍然**不发网络请求**（签票发生在用户真的按下说话时）。
 */
import { computed, ref, watch } from 'vue'
import { useXiaomuPrefs, DEFAULT_TTS_BASE } from '../composables/useXiaomuPrefs'
import { useXiaomuVoice, clampRate } from '../composables/useXiaomuVoice'
import { useXiaomuIat } from '../composables/useXiaomuIat'
import { ZHIPU_VOICES, getKey, setKey, clearKey, synthesize, synthesizeViaServer } from '../../utils/cloudTts'
import { voiceKeySet, voiceKeyGet, voiceKeyClear } from '../../api/xiaomuVoice'
import { useIdentity } from '../../composables/useIdentity'

const prefs = useXiaomuPrefs()
const voice = useXiaomuVoice()
const iat = useXiaomuIat()

const playing = ref(false)

// ===== M6-1b：云端音色（用户自带 Key）=====
// 面板**不主动发合成请求**（与 M6-1/M6-2c 一致）：只有点「测试连接」或「试听」才会合成。
// 唯一例外是「账号模式」拉一次自己的保存状态（只读、只回掩码）——
// 不给这次读取，「存到账号」的用户就看不到自己到底存没存过。
const isCloud = computed(() => prefs.voiceEngine === 'cloud')

/** 两档共用一个下拉：系统档写 voiceURI，云端档写 ttsVoice */
const voiceValue = computed({
  get: () => (isCloud.value ? prefs.ttsVoice : prefs.voiceURI),
  set: (v) => {
    if (isCloud.value) prefs.ttsVoice = v
    else prefs.voiceURI = v
  },
})

const keyInput = ref(getKey())
const hasKey = ref(!!getKey())
const testing = ref(false)
const cloudMsg = ref('')
const msgIsErr = ref(false)

// ---- M6-1c：账号模式（服务端加密存 Key，后端代发）----
const ident = useIdentity()
const isAccount = computed(() => prefs.ttsTransport === 'account')
const accountBusy = ref(false)
const accountExists = ref(false)
const accountMask = ref('')

/** 能不能测试：本机模式看有没有本地 Key，账号模式看账号里有没有存 */
const canTest = computed(() => (isAccount.value ? accountExists.value : hasKey.value))
const canClear = computed(() => (isAccount.value ? accountExists.value : hasKey.value))

/** 读一次账号里的配置状态（只回掩码） */
async function refreshAccount() {
  if (!ident.userId.value) {
    accountExists.value = false
    accountMask.value = ''
    return
  }
  const r = await voiceKeyGet(ident.userId.value, ident.token())
  if (r.ok) {
    accountExists.value = r.exists
    accountMask.value = r.mask || ''
  }
}

function onTransport(t) {
  prefs.ttsTransport = t === 'account' ? 'account' : 'local'
  if (prefs.ttsTransport === 'account') {
    // 账号模式要落库 ⇒ 必须有确权账号（后端也是这个门槛，这里提前拦，省一次 403）
    if (!ident.userId.value || ident.isQuickGuest.value) {
      say('账号模式需要先注册账号（或用 GitHub 登录）。', true)
      prefs.ttsTransport = 'local'
      return
    }
    refreshAccount()
    say('账号模式：密钥加密后存在服务器，换设备也能用。')
  } else {
    say('')
  }
}

function say(text, isErr = false) {
  cloudMsg.value = text
  msgIsErr.value = isErr
}

function onEngine(engine) {
  prefs.voiceEngine = engine === 'cloud' ? 'cloud' : 'system'
  // 切来源先停掉正在念的，否则上一档的声音还在响，用户会以为切换没生效
  voice.stop()
  playing.value = false
  if (prefs.voiceEngine !== 'cloud') { say(''); return }
  // 切到云端时按当前存放方式判断"能不能用"，不要把账号模式的用户错判成没配 Key
  if (isAccount.value) {
    refreshAccount()
    say('')
    return
  }
  if (!getKey()) say('先把你的密钥填进来，再点「测试连接」。')
  else say('')
}

/**
 * 接口地址归一：必须是 https 且能被 URL 解析。
 * 🔴 这段校验**不能省** —— 面板写进 prefs 的值会被 cloudTts 直接拿去 fetch，
 *    一个 `javascript:` / `http:` 就会被原样发出去（prefs 的 load() 也做了同样兜底，双保险）。
 */
function onBase(e) {
  const raw = String(e.target.value || '').trim()
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:') throw new Error('proto')
    const v = (u.origin + u.pathname).replace(/\/+$/, '')
    prefs.ttsBaseUrl = v
    e.target.value = v
    say('')
  } catch {
    prefs.ttsBaseUrl = DEFAULT_TTS_BASE
    e.target.value = DEFAULT_TTS_BASE
    say('接口地址必须以 https:// 开头，已改回默认地址。', true)
  }
}

function onModel(e) {
  const raw = String(e.target.value || '').trim()
  if (!raw || raw.length > 80 || !/^[A-Za-z0-9._:-]+$/.test(raw)) {
    prefs.ttsModel = 'glm-tts'
    e.target.value = 'glm-tts'
    say('模型名只能包含字母、数字、. _ : -，已改回 glm-tts。', true)
    return
  }
  prefs.ttsModel = raw
  say('')
}

async function onSaveKey() {
  // ---- 账号模式：加密存到服务器 ----
  if (isAccount.value) {
    if (!ident.userId.value) { say('请先登录后再保存到账号。', true); return }
    if (!keyInput.value && !accountExists.value) { say('请先填写密钥。', true); return }
    accountBusy.value = true
    say('正在保存…')
    const r = await voiceKeySet(ident.userId.value, ident.token(), {
      baseUrl: prefs.ttsBaseUrl,
      model: prefs.ttsModel,
      voice: prefs.ttsVoice,
      key: keyInput.value,
    })
    accountBusy.value = false
    if (r.ok) {
      accountExists.value = true
      accountMask.value = r.mask || ''
      // 存到账号后就不在本机留明文了（否则「存到账号」变成两份 Key）
      clearKey()
      keyInput.value = ''
      hasKey.value = false
      say('已加密保存到你的账号。')
    } else {
      say(accountErrMsg(r), true)
    }
    return
  }

  // ---- 本机模式 ----
  const v = setKey(keyInput.value)
  keyInput.value = v
  hasKey.value = !!v
  say(v ? '已保存到这台设备。' : '密钥是空的，没有保存。', !v)
}

function accountErrMsg(r) {
  const m = {
    'no-identity': '请先登录',
    unsupported: '账号模式的后端还没上线（需要先部署 content 函数）',
    'bad-config': '接口地址或音色名不被允许',
    quota: '操作太频繁，稍等一下',
    network: '连不上服务器，稍后再试',
  }
  return r.error || m[r.reason] || '保存失败'
}

async function onClearKey() {
  if (isAccount.value) {
    if (!ident.userId.value) { say('请先登录。', true); return }
    accountBusy.value = true
    const r = await voiceKeyClear(ident.userId.value, ident.token())
    accountBusy.value = false
    if (r.ok) {
      accountExists.value = false
      accountMask.value = ''
      say('已从账号删除。')
    } else {
      say(accountErrMsg(r), true)
    }
    return
  }
  clearKey()
  keyInput.value = ''
  hasKey.value = false
  say('已清除。')
}

async function onTest() {
  const useServer = isAccount.value
  if (useServer && !ident.userId.value) { say('请先登录。', true); return }
  if (!useServer && !getKey()) { say('还没有填密钥。', true); return }
  if (useServer && !accountExists.value) { say('账号里还没有保存密钥。', true); return }

  testing.value = true
  say('正在测试…')
  const common = {
    baseUrl: prefs.ttsBaseUrl,
    model: prefs.ttsModel,
    voice: prefs.ttsVoice,
    text: '嗯，我是小木。',
    speed: prefs.voiceRate,
    key: getKey(),
  }
  const r = useServer
    ? await synthesizeViaServer({ userId: ident.userId.value, authToken: ident.token(), text: common.text, speed: common.speed })
    : await synthesize(common)
  testing.value = false
  // 成功就不播、不落盘：Blob 交给 GC 即可（没有创建 object URL，也就没有要 revoke 的东西）
  if (r.ok) say('✓ 可以了，这个密钥能用。')
  else say(r.message || accountErrMsg({ reason: r.reason }) || '测试失败', true)
}

/** 播报过程中的云端失败（例如 Key 中途失效）—— 让面板也能看到，而不是只在控制台 */
watch(
  () => voice.cloudNotice.value,
  (v) => {
    if (v) {
      say(v, true)
      voice.cloudNotice.value = ''   // 只提示一次，避免每次重渲染都刷出来
    }
  }
)

/** 中文音色排前面；非中文的在名字后标注语言码，避免用户看到一堆没意义的 lang */
const sortedVoices = computed(() => {
  const zh = []
  const other = []
  for (const v of voice.voices.value) {
    const isZh = /^zh(\b|[-_])/i.test(v.lang || '')
    const label = isZh ? v.name : `${v.name}${v.lang ? ` · ${v.lang}` : ''}`
    ;(isZh ? zh : other).push({ uri: v.uri, label })
  }
  return [...zh, ...other]
})

const rateLabel = computed(() => {
  const r = clampRate(Number(prefs.voiceRate))
  if (r <= 0.85) return '慢'
  if (r >= 1.15) return '快'
  return '正常'
})

/** 打开面板即尝试拉音色列表（部分浏览器列表就绪很慢，需要轮询兜底） */
voice.loadVoices()

// 上次选的是账号模式 → 顺手拉一次账号里的保存状态（只回掩码，不解密）
if (isAccount.value) refreshAccount()

function onToggleOn(on) {
  prefs.voiceOn = on
  if (on) {
    voice.loadVoices()
    // 有用户手势上下文 → 直接念一句当确认（比任何文案都清楚）
    playing.value = true
    voice.speak('嗯，我可以说话了。', {
      voiceURI: prefs.voiceURI,
      rate: prefs.voiceRate,
      onEnd: () => { playing.value = false },
    })
  } else {
    voice.stop()
    playing.value = false
  }
}

function onPreview() {
  if (playing.value) {
    voice.stop()
    playing.value = false
    return
  }
  playing.value = true
  voice.preview(prefs.voiceURI, prefs.voiceRate)
}

/** 任何一路播完/被打断 → 复位按钮文案 */
watch(() => voice.speaking.value, (on) => { if (!on) playing.value = false })

function onRate(val) {
  prefs.voiceRate = clampRate(Number(val))
}
</script>

<style>
.xm-vc {
  display: flex;
  flex-direction: column;
  gap: 9px;
  font-size: 12px;
  color: #2b2b2b;
}
.xm-vc-lead { margin: 0; font-size: 11px; line-height: 1.5; opacity: .7; }
.xm-vc-unsupported p { margin: 0; font-size: 12px; line-height: 1.55; opacity: .7; }

.xm-vc-switch { display: flex; align-items: flex-start; gap: 6px; font-size: 11.5px; line-height: 1.45; }
.xm-vc-switch input { margin: 1px 0 0; flex: none; }
.xm-vc-switch.is-dim { opacity: .5; }

.xm-vc-row { display: flex; flex-direction: column; gap: 4px; }
.xm-vc-row.is-dim { opacity: .5; }
.xm-vc-label { font-size: 11px; opacity: .6; }
.xm-vc-picker { display: flex; align-items: center; gap: 6px; }
.xm-vc-input {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  border: 1px solid var(--xm-line, #2b2b2b);
  border-radius: 8px;
  background: #fff;
  color: #2b2b2b;
  font-family: inherit;
  font-size: 12px;
  padding: 6px 8px;
  outline: none;
}
.xm-vc-input:focus { border-color: #ff9ec4; }
.xm-vc-input:disabled { background: #faf8f4; }
.xm-vc-mini {
  flex: none;
  border: 1px solid var(--xm-line, #2b2b2b);
  background: #fff; color: #2b2b2b;
  border-radius: 999px;
  font-size: 11px; line-height: 1; padding: 6px 11px;
  cursor: pointer; font-family: inherit;
}
.xm-vc-mini:hover:not(:disabled) { background: #f0ece2; }
.xm-vc-mini:disabled { opacity: .45; cursor: default; }
.xm-vc-hint { font-size: 10px; line-height: 1.4; opacity: .5; }

.xm-vc-range { width: 100%; accent-color: #ffb3d1; }

.xm-vc-note {
  margin: 2px 0 0; padding-top: 8px;
  border-top: 1px dashed #d8d2c6;
  font-size: 10px; line-height: 1.5; opacity: .55;
}
.xm-vc-note.is-warn { color: #c2410c; opacity: .9; }

/* M6-1b：云端音色设置 */
.xm-vc-cloud {
  border: 1px dashed #d8d2c6;
  border-radius: 10px;
  padding: 8px 10px;
  background: #faf8f4;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.xm-vc-cloud-sum {
  font-size: 11.5px;
  color: #2b2b2b;
  cursor: pointer;
  list-style: none;
  user-select: none;
}
.xm-vc-cloud-sum::-webkit-details-marker { display: none; }
.xm-vc-cloud-sum::before { content: '▸ '; opacity: .5; }
.xm-vc-cloud[open] .xm-vc-cloud-sum::before { content: '▾ '; }
.xm-vc-hint.is-err { color: #c2410c; opacity: .95; }

/* M6-2c：语音输入小节 */
.xm-vc-sep { margin: 4px 0 2px; border-top: 1px solid #ece6da; }
.xm-vc-key {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px dashed #d8d2c6;
  border-radius: 10px;
  padding: 7px 10px;
  background: #faf8f4;
}
.xm-vc-key-t { font-size: 11.5px; color: #2b2b2b; }
.xm-vc-key-d { margin-left: auto; font-size: 10.5px; opacity: .5; }
</style>
