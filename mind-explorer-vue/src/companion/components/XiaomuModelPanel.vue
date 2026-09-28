<template>
  <div class="xm-model">
    <!-- D6 门槛 · 未登录：引导文案。**一个请求都不发** -->
    <div v-if="gate === 'none'" class="xm-md-gate">
      <p class="xm-md-gate-main">先和小木打个招呼，就能配置自己的模型啦。</p>
      <p class="xm-md-hint">登录后可以带上你自己的模型来和小木聊天。</p>
    </div>

    <!-- D6 门槛 · 快速游客：锁定态 + 注册入口。**同样不发请求** -->
    <div v-else-if="gate === 'quick'" class="xm-md-gate">
      <p class="xm-md-gate-main">注册账号后即可配置自己的模型。</p>
      <p class="xm-md-hint">你现在是「临时访客」，换台设备就找不到了。</p>
      <button type="button" class="xm-md-btn is-primary" data-xm="register" @click="emit('register')">去注册</button>
    </div>

    <!-- 确权账号（guest / github）：正常面板 -->
    <template v-else>
      <p v-if="loading" class="xm-md-hint">正在读取配置…</p>

      <template v-else>
        <p v-if="envNote" class="xm-md-note">{{ envNote }}</p>

        <label class="xm-md-row">
          <span class="xm-md-label">模型平台</span>
          <select v-model="form.provider" class="xm-md-input" data-xm="provider" @change="onProviderChange">
            <option v-for="p in presets" :key="p.id" :value="p.id">{{ p.label }}</option>
          </select>
        </label>

        <label v-if="needEndpoint" class="xm-md-row">
          <span class="xm-md-label">endpoint</span>
          <input
            v-model="form.baseUrl" class="xm-md-input" type="text" data-xm="endpoint"
            placeholder="https://..." spellcheck="false" autocomplete="off"
          />
          <span v-if="localHint" class="xm-md-hint is-warn" data-xm="localHint">{{ localHint }}</span>
          <span v-else class="xm-md-hint">须为 https 且 443 端口（本机 Ollama 也请用 https 反代）</span>
        </label>

        <div class="xm-md-row">
          <span class="xm-md-label">模型名</span>
          <input
            v-model="form.model" class="xm-md-input" type="text" data-xm="model"
            :placeholder="currentPreset.customEndpoint ? '例如 qwen2.5:7b' : '选择或填写模型名'"
            spellcheck="false" autocomplete="off"
          />
          <div v-if="modelSuggestions.length" class="xm-md-chips">
            <button
              v-for="m in modelSuggestions" :key="m" type="button"
              class="xm-md-chip" :class="{ 'is-on': form.model === m }"
              @click="form.model = m"
            >{{ m }}</button>
          </div>
        </div>

        <div class="xm-md-row">
          <span class="xm-md-label">API Key</span>
          <template v-if="hasSavedKey && !changingKey">
            <div class="xm-md-keyline">
              <code class="xm-md-mask" data-xm="keyMask">{{ saved.keyMask }}</code>
              <button type="button" class="xm-md-mini" data-xm="changeKey" @click="changingKey = true">更换</button>
            </div>
            <span class="xm-md-hint">已加密保存在服务端，这里只显示掩码</span>
          </template>
          <template v-else>
            <input
              v-model="form.key" class="xm-md-input" type="password" data-xm="key"
              placeholder="sk-..." autocomplete="off" spellcheck="false"
            />
            <span class="xm-md-hint">只提交给服务端加密保存，前端不留存</span>
          </template>
        </div>

        <div class="xm-md-actions">
          <button type="button" class="xm-md-btn is-primary" data-xm="save" :disabled="busy || !canSave" @click="onSave">
            {{ busy ? '保存中…' : (saved.exists ? '保存修改' : '启用') }}
          </button>
          <button type="button" class="xm-md-btn" data-xm="test" :disabled="testing || !saved.exists" @click="onTest">
            {{ testing ? '测试中…' : '测试连通' }}
          </button>
        </div>

        <p v-if="msg" class="xm-md-msg" :class="`is-${msgKind}`" data-xm="msg">{{ msg }}</p>

        <div v-if="saved.exists" class="xm-md-foot">
          <label class="xm-md-switch">
            <input type="checkbox" data-xm="toggle" :checked="saved.enabled" @change="onToggle($event.target.checked)" />
            <span>启用中（关掉即回落小木默认模型，配置不会丢）</span>
          </label>

          <div class="xm-md-reset">
            <button v-if="!confirmClear" type="button" class="xm-md-link" data-xm="reset" @click="confirmClear = true">恢复默认</button>
            <template v-else>
              <span class="xm-md-warn">确定恢复默认？</span>
              <button type="button" class="xm-md-link is-danger" data-xm="resetConfirm" @click="onClear">确定</button>
              <button type="button" class="xm-md-link" data-xm="resetCancel" @click="confirmClear = false">取消</button>
            </template>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup>
/**
 * XiaomuModelPanel —— 自定义模型设置（M5-3，D10 并入小木面板）
 *
 * 门槛（D6）：只有「确权账号」（正式游客 / GitHub 用户）才发请求；
 *   未登录（none）与快速游客（quick）**一个请求都不发**，只显示引导。
 *   这条是验收断言之一 —— 不是为了省流量，而是因为快速游客 g:g_xxx
 *   无密码、清 localStorage 即换新 uid，放开等于把 companion 变成匿名出网代理。
 *
 * 组件只负责「面板内容」，不含定位与浮层外壳（挂载方式由父层决定）。
 * 所有网络异常都由 api 层吞掉并降级为可读文案，这里不会抛。
 */
import { computed, reactive, ref, watch } from 'vue'
import { useIdentity } from '../../composables/useIdentity'
import { xmModel, modelReasonText } from '../../api/xiaomuModel'

const emit = defineEmits(['register'])

const ident = useIdentity()

/** 后端 MODEL_PRESETS 的兜底副本（真源在 supabase/functions/content/index.js）。
 *  仅用于 presets 请求失败（后端未部署 / 断网）时保证下拉不是空的 —— 不参与判定。 */
const FALLBACK_PRESETS = [
  { id: 'zhipu', label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4-flash-250414', 'glm-4.6-flash'], customEndpoint: false },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat'], customEndpoint: false },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o-mini'], customEndpoint: false },
  { id: 'ollama', label: 'Ollama（自建）', baseUrl: '', models: ['qwen2.5:7b', 'llama3.1:8b'], customEndpoint: true },
  { id: 'custom', label: '自定义（OpenAI 兼容）', baseUrl: '', models: [], customEndpoint: true },
]

/** D6 门槛三态 */
const gate = computed(() => {
  const k = ident.kind.value
  if (k === 'github' || k === 'guest') return 'ok'
  if (k === 'quick') return 'quick'
  return 'none'
})

const presets = ref(FALLBACK_PRESETS)
const loading = ref(false)
const busy = ref(false)
const testing = ref(false)
const changingKey = ref(false)
const confirmClear = ref(false)
const envNote = ref('')
const msg = ref('')
const msgKind = ref('ok')

const form = reactive({ provider: 'zhipu', baseUrl: '', model: '', key: '' })
const saved = reactive({ exists: false, enabled: true, keyMask: '' })

function setMsg(text, kind = 'ok') { msg.value = text; msgKind.value = kind }
function clearMsg() { msg.value = '' }

const currentPreset = computed(
  () => presets.value.find((p) => p.id === form.provider) || FALLBACK_PRESETS[0]
)
/** 只有 ollama / custom 需要用户手填 endpoint */
const needEndpoint = computed(() => !!currentPreset.value.customEndpoint)
const modelSuggestions = computed(() => currentPreset.value.models || [])
/** 已存过 Key 且没点「更换」→ 不必重填 */
const hasSavedKey = computed(() => saved.exists && !!saved.keyMask && !changingKey.value)

/**
 * 体验层预检（§6.2「填非 443 端口 → 前端即拦」）。
 * ⚠️ 真源仍是服务端的 `_shared/netguard.js` —— 这里只做「明显不可能通过」的提前拦截，
 *    少一次白跑；**绝不替代**服务端校验（服务端那一道始终在）。
 */
const localHint = computed(() => {
  if (!needEndpoint.value) return ''
  const u = form.baseUrl.trim()
  if (!u) return ''
  if (!/^https:\/\//i.test(u)) return 'endpoint 要以 https:// 开头'
  let parsed
  try {
    parsed = new URL(u)
  } catch {
    return 'endpoint 不是一个合法网址'
  }
  if (parsed.port && parsed.port !== '443') return 'endpoint 只能用 443 端口'
  return ''
})

const canSave = computed(() => {
  if (!form.model.trim()) return false
  if (needEndpoint.value && !form.baseUrl.trim()) return false
  if (localHint.value) return false
  if (!hasSavedKey.value && !form.key.trim()) return false
  return true
})

/** 切换平台：带上预置地址，清掉属于上一平台的模型名 */
function onProviderChange() {
  const p = currentPreset.value
  form.baseUrl = p.customEndpoint ? '' : p.baseUrl
  form.model = ''
  clearMsg()
}

function resetSaved() {
  saved.exists = false
  saved.enabled = true
  saved.keyMask = ''
  form.provider = 'zhipu'
  form.baseUrl = FALLBACK_PRESETS[0].baseUrl
  form.model = ''
  form.key = ''
  changingKey.value = false
  confirmClear.value = false
  envNote.value = ''
}

/**
 * 拉取配置。
 * 🔴 D6：gate 不是 'ok' 时**立刻返回，不发任何请求**（验收断言）。
 */
async function load() {
  if (gate.value !== 'ok') { resetSaved(); clearMsg(); return }
  loading.value = true
  clearMsg()
  const uid = ident.userId.value
  const tk = ident.token()

  const [pr, gr] = await Promise.all([xmModel.presets(), xmModel.get(uid, tk)])

  // presets 失败就保留兜底副本，不打断面板（它不参与判定，只是下拉选项）
  if (pr.ok && pr.presets.length) presets.value = pr.presets

  if (!gr.ok) {
    loading.value = false
    resetSaved()
    setMsg(modelReasonText(gr.reason, gr.error), 'err')
    return
  }

  envNote.value = gr.note || ''
  saved.exists = gr.exists
  saved.enabled = gr.enabled
  saved.keyMask = gr.keyMask || ''
  if (gr.exists) {
    form.provider = gr.provider || 'zhipu'
    form.baseUrl = gr.baseUrl || ''
    form.model = gr.model || ''
  } else {
    form.provider = 'zhipu'
    form.baseUrl = FALLBACK_PRESETS[0].baseUrl
    form.model = ''
  }
  form.key = ''
  changingKey.value = false
  confirmClear.value = false
  loading.value = false
}

// 挂载即载入；身份变化（登录 / 注册 / 退出）时重新载入
watch(() => ident.kind.value, load, { immediate: true })

async function onSave() {
  if (!canSave.value || busy.value) return
  busy.value = true
  clearMsg()
  const payload = {
    provider: form.provider,
    baseUrl: needEndpoint.value ? form.baseUrl.trim() : '',
    model: form.model.trim(),
  }
  // 未填 = 只改模型不改 Key（服务端沿用库中密文）
  if (form.key.trim()) payload.key = form.key.trim()

  const r = await xmModel.save(ident.userId.value, ident.token(), payload)
  busy.value = false
  if (!r.ok) { setMsg(modelReasonText(r.reason, r.error), 'err'); return }

  saved.exists = true
  saved.enabled = true
  if (r.keyMask) saved.keyMask = r.keyMask
  form.key = ''
  changingKey.value = false
  setMsg(saved.keyMask ? '已保存，小木下次就用你的模型了' : '已保存', 'ok')
}

async function onTest() {
  if (testing.value || !saved.exists) return
  testing.value = true
  clearMsg()
  const r = await xmModel.test(ident.userId.value, ident.token())
  testing.value = false
  if (r.ok) { setMsg(`连通正常，延迟 ${r.latencyMs}ms`, 'ok'); return }
  const head = r.probe ? '连不通' : modelReasonText(r.reason, r.error)
  setMsg(r.detail ? `${head}（${r.detail}）` : head, 'err')
}

async function onToggle(enabled) {
  clearMsg()
  const r = await xmModel.toggle(ident.userId.value, ident.token(), enabled)
  if (!r.ok) { setMsg(modelReasonText(r.reason, r.error), 'err'); return }
  saved.enabled = r.enabled
  setMsg(r.enabled ? '已启用，小木会用你的模型' : '已关闭，小木回到默认模型', 'ok')
}

async function onClear() {
  clearMsg()
  const r = await xmModel.clear(ident.userId.value, ident.token())
  if (!r.ok) { setMsg(modelReasonText(r.reason, r.error), 'err'); return }
  resetSaved()
  setMsg('已恢复默认', 'ok')
}
</script>

<style>
.xm-model {
  display: flex;
  flex-direction: column;
  gap: 9px;
  font-size: 12px;
  color: #2b2b2b;
}

/* 门槛区（未登录 / 快速游客） */
.xm-md-gate { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.xm-md-gate-main { margin: 0; font-size: 12px; line-height: 1.5; }

.xm-md-row { display: flex; flex-direction: column; gap: 4px; }
.xm-md-label { font-size: 11px; opacity: .6; }
.xm-md-input {
  width: 100%;
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
.xm-md-input:focus { border-color: #ff9ec4; }
.xm-md-hint { font-size: 10px; line-height: 1.4; opacity: .5; }
.xm-md-hint.is-warn { color: #c2410c; opacity: .9; }
.xm-md-note { margin: 0; font-size: 10px; line-height: 1.4; color: #c2410c; }

/* 模型名候选 */
.xm-md-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.xm-md-chip {
  border: 1px solid var(--xm-line, #2b2b2b);
  background: #fff; color: #2b2b2b;
  border-radius: 999px;
  font-size: 10px; line-height: 1; padding: 4px 8px;
  cursor: pointer; font-family: inherit;
}
.xm-md-chip.is-on { background: #ffd6e7; }

/* 已存 Key 的掩码行 */
.xm-md-keyline { display: flex; align-items: center; gap: 8px; }
.xm-md-mask {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  background: #f7f4ee;
  border: 1px solid #d8d2c6;
  border-radius: 8px;
  padding: 6px 8px;
}

/* 按钮 */
.xm-md-actions { display: flex; gap: 6px; }
.xm-md-btn {
  flex: 1;
  border: 1px solid var(--xm-line, #2b2b2b);
  background: #fff; color: #2b2b2b;
  border-radius: 999px;
  font-size: 11px; line-height: 1; padding: 7px 0;
  cursor: pointer; font-family: inherit;
}
.xm-md-btn:hover { background: #f0ece2; }
.xm-md-btn.is-primary { background: #ffd6e7; }
.xm-md-btn.is-primary:hover { background: #ffc7dd; }
.xm-md-btn:disabled { opacity: .45; cursor: default; }
.xm-md-btn:disabled:hover { background: #fff; }
.xm-md-btn.is-primary:disabled:hover { background: #ffd6e7; }
.xm-md-mini {
  flex: none;
  border: 1px solid var(--xm-line, #2b2b2b);
  background: #fff; color: #2b2b2b;
  border-radius: 999px;
  font-size: 11px; line-height: 1; padding: 6px 11px;
  cursor: pointer; font-family: inherit;
}
.xm-md-mini:hover { background: #f0ece2; }

/* 提示与页脚 */
.xm-md-msg { margin: 0; font-size: 11px; line-height: 1.4; }
.xm-md-msg.is-ok { color: #4d7c0f; }
.xm-md-msg.is-err { color: #c2410c; }
.xm-md-foot {
  display: flex; flex-direction: column; gap: 7px;
  margin-top: 2px; padding-top: 8px; border-top: 1px dashed #d8d2c6;
}
.xm-md-switch { display: flex; align-items: flex-start; gap: 6px; font-size: 11px; line-height: 1.4; }
.xm-md-switch input { margin: 1px 0 0; flex: none; }
.xm-md-reset { display: flex; align-items: center; gap: 8px; }
.xm-md-link {
  border: none; background: none; padding: 0;
  font-size: 11px; line-height: 1; cursor: pointer;
  color: #2b2b2b; opacity: .6; text-decoration: underline;
  font-family: inherit;
}
.xm-md-link:hover { opacity: 1; }
.xm-md-link.is-danger { color: #c2410c; opacity: 1; }
.xm-md-warn { font-size: 11px; color: #c2410c; }
</style>
