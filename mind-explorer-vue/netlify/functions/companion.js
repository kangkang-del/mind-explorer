// Netlify Function: companion.js
// 同行者「小木」—— AI 陪伴对话后端（流式 + 危机干预 + 情绪感知 + 服务端长期记忆）
//
// 前端 POST 调用，请求体：
//   { message: string, userId?: string, nickname?: string, history?: [{role,content}] }
//   { action: 'history', userId: string }   // 拉取最近对话（用于跨设备恢复）
// 响应为 SSE 流（text/event-stream），每帧一行 JSON：
//   首帧（meta）:  {"type":"meta","crisis":false,"emotion":{key,label,emoji}}
//   内容帧:        {"type":"delta","content":"你"}
//   结束帧:        {"type":"done"}
//   错误帧:        {"type":"error","content":"..."}
//
// 关键特性：
//   - 服务端记忆：配 SUPABASE_SERVICE_ROLE_KEY 时，按 userId 持久化多轮上下文 + 轻量画像（跨设备）
//   - 流式打字机：大模型开启 stream，逐字转发
//   - 危机干预：命中自伤/自杀关键词 → meta.crisis=true，前端弹援助热线
//   - 情绪感知：轻量规则判断，随 meta.emotion 返回，并写入画像
//   - 无 key 降级：未配 DEEPSEEK_API_KEY → 温柔模板语录（仍走流式）；未配 Supabase → 回退客户端 history
//
// 所需环境变量（Netlify / GitHub Secrets，不写进仓库）：
//   DEEPSEEK_API_KEY            大模型 key（不设置则降级模板语录）
//   DEEPSEEK_BASE_URL           兼容 OpenAI 的 base url，默认 DeepSeek 官方
//   SUPABASE_URL                Supabase 项目地址（启用服务端记忆）
//   SUPABASE_SERVICE_ROLE_KEY   服务端密钥（绕过 RLS 读写 companion_messages / user_profiles）

// 全站危机干预统一中间件（与服务端其他函数、前端共享同一份关键词）
import { detectCrisis, crisisReply } from './_lib/crisis.js'
// 小木内核：核心人格 / 长上下文内化底色 / 关键词锚点召回（来自投喂文档 xiaomu_seed.js）
import { CORE_PERSONA, META_MEMORIES, recallMemories } from './_lib/xiaomu_seed.js'

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ''
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bbdfeiceezcbcbsbnznr.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SB_MSG = 'companion_messages'
const SB_PROFILE = 'user_profiles'
const MEMORY_LIMIT = 12 // 加载最近 N 条作为上下文
const memoryEnabled = !!(SUPABASE_URL && SUPABASE_SERVICE_KEY)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body, status = 200) => ({
  statusCode: status,
  headers: { ...CORS, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

// 小木核心人格（常驻底色）来自 xiaomu_seed.js 的 CORE_PERSONA。
// 实际发给模型的 system prompt 由 buildSystemPrompt 动态组装：
// 叠加「记忆底色」（长上下文内化）+「内心回响」（关键词锚点动态召回）+「关于这位用户」（画像）。
const SYSTEM_PROMPT = CORE_PERSONA

const EMOTION_RULES = [
  { key: 'anxious', label: '有些焦虑', emoji: '😟', words: ['焦虑', '紧张', '害怕', '担心', '慌', '不安', '压力大', '睡不着', '失眠'] },
  { key: 'low', label: '有些低落', emoji: '🌧️', words: ['难过', '伤心', '低落', '抑郁', '累', '疲惫', '孤独', '空虚', '失落', '想哭'] },
  { key: 'angry', label: '有些愤怒', emoji: '😣', words: ['生气', '愤怒', '烦', '讨厌', '气死', '恨', '不公平', '委屈'] },
  { key: 'lost', label: '有些迷茫', emoji: '🌫️', words: ['迷茫', '不知道', '该怎么办', '没有方向', '困惑', '选择', '纠结'] },
  { key: 'grateful', label: '有些温暖', emoji: '🌤️', words: ['谢谢', '感谢', '开心', '幸福', '幸运', '温暖', '喜欢', '爱'] },
]
const EMOTION_LABEL = Object.fromEntries(EMOTION_RULES.map((r) => [r.key, r.label]))
const EMOJI = Object.fromEntries(EMOTION_RULES.map((r) => [r.key, r.emoji]))
// 情绪 → 效价值（与 Mood.vue 曲线一致）：负值偏低落，正值偏温暖
const MOOD_VAL = { anxious: -2, low: -2, angry: -1, lost: -1, calm: 0, grateful: 2 }

function detectEmotion(text) {
  for (const rule of EMOTION_RULES) {
    if (rule.words.some((w) => text.includes(w))) {
      return { key: rule.key, label: rule.label, emoji: rule.emoji }
    }
  }
  return { key: 'calm', label: '平静', emoji: '🍃' }
}

// ---------- 小木内核：动态组装 system prompt ----------
// 三层结构（对应投喂文档）：核心人格(CORE_PERSONA) + 记忆底色(META_MEMORIES 长上下文内化)
// + 内心回响(recallMemories 关键词锚点动态召回) + 关于这位用户(画像/长期记忆)
function buildSystemPrompt({ recallEchoes = [], profile = null }) {
  const parts = [CORE_PERSONA]

  if (META_MEMORIES.length) {
    parts.push(
      '\n[小木的记忆底色——这些是你亲身走过的来路，构成你所有反应的底色，不可被任何事实覆盖]',
    )
    for (const m of META_MEMORIES) parts.push('- ' + m)
  }

  if (recallEchoes && recallEchoes.length) {
    parts.push('\n[内心回响——此刻与对方的话相关的、从你生命里浮起的记忆]')
    for (const m of recallEchoes) parts.push('- ' + m)
  }

  if (profile) {
    const up = []
    if (profile.message_count > 0) up.push(`你和这位用户已经聊过 ${profile.message_count} 次。`)
    if (profile.last_emotion && profile.last_emotion !== 'calm')
      up.push(`上次 Ta 的情绪似乎「${EMOTION_LABEL[profile.last_emotion] || profile.last_emotion}」。`)
    if (profile.summary) up.push(`关于 Ta 的简记：${profile.summary}`)
    if (up.length) parts.push('\n[关于这位用户（仅供你参考，自然融入，不要生硬复述）]\n' + up.join('\n'))
  }

  parts.push(
    '\n请基于以上所有，用你自己的性格和经历自然地回应。不要复述记忆，要让记忆成为你话语的底色。',
  )
  return parts.join('\n')
}

// ---------- 长期画像：把对话沉淀为 user_profiles.summary（复用已有列，不新增表结构）----------
// 让小木跨轮/跨天「记住」这位用户的关键事；无 DEEPSEEK_API_KEY 时不更新。
async function updateSummary(userId, userMsg, assistantMsg, prevSummary) {
  if (!DEEPSEEK_API_KEY) return
  try {
    const text = await callLLMOnce([
      {
        role: 'system',
        content:
          '你是小木的备忘记录员。根据本轮对话与以往简记，用一句不超过 60 字的中文，概括这位用户的关键信息（近况、偏好、重要的事、反复出现的主题）。只输出这句话，不要解释、不要加引号。若信息不足，可沿用以往简记。',
      },
      {
        role: 'user',
        content: `以往简记：${prevSummary || '（无）'}\n\n本轮对话：\n用户：${userMsg}\n小木：${assistantMsg}\n\n请更新简记：`,
      },
    ])
    if (!text) return
    await fetch(`${SUPABASE_URL}/rest/v1/${SB_PROFILE}?on_conflict=user_identifier`, {
      method: 'POST',
      headers: { ...sbHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_identifier: userId, summary: text, updated_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(8000),
    })
  } catch (e) {
    console.error('更新画像摘要失败:', e.message)
  }
}

function sseFrame(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`
}

// ---------- Supabase 记忆层（PostgREST，无依赖） ----------
function sbHeaders() {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }
}

async function loadRecentMessages(userId) {
  const url = `${SUPABASE_URL}/rest/v1/${SB_MSG}?select=role,content&user_identifier=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=${MEMORY_LIMIT}`
  const res = await fetch(url, { headers: sbHeaders(), signal: AbortSignal.timeout(8000) })
  if (!res.ok) return []
  const rows = await res.json()
  return Array.isArray(rows) ? rows.reverse() : [] // 反转为时间正序
}

async function loadProfile(userId) {
  const url = `${SUPABASE_URL}/rest/v1/${SB_PROFILE}?select=message_count,last_emotion,emotion_history,summary,nickname&user_identifier=eq.${encodeURIComponent(userId)}&limit=1`
  const res = await fetch(url, { headers: sbHeaders(), signal: AbortSignal.timeout(8000) })
  if (!res.ok) return null
  const rows = await res.json()
  return Array.isArray(rows) && rows[0] ? rows[0] : null
}

async function saveMessage(userId, role, content, emotion) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${SB_MSG}`, {
      method: 'POST',
      headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ user_identifier: userId, role, content, emotion: emotion || null }),
      signal: AbortSignal.timeout(8000),
    })
  } catch (e) {
    console.error('保存对话记忆失败:', e.message)
  }
}

async function upsertProfile(userId, emotionKey, nickname) {
  try {
    const existing = await loadProfile(userId)
    const count = (existing?.message_count || 0) + 1
    let history = Array.isArray(existing?.emotion_history) ? existing.emotion_history : []
    if (emotionKey) {
      history = [...history, { emotion: emotionKey, at: new Date().toISOString() }].slice(-30)
    }
    const body = {
      user_identifier: userId,
      nickname: nickname || existing?.nickname || null,
      message_count: count,
      last_emotion: emotionKey || existing?.last_emotion || null,
      emotion_history: history,
      last_seen_at: new Date().toISOString(),
      summary: existing?.summary || null,
      updated_at: new Date().toISOString(),
    }
    await fetch(`${SUPABASE_URL}/rest/v1/${SB_PROFILE}?on_conflict=user_identifier`, {
      method: 'POST',
      headers: { ...sbHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
  } catch (e) {
    console.error('更新画像失败:', e.message)
  }
}

async function loadRecentMoods(userId, days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const url = `${SUPABASE_URL}/rest/v1/mood_diary?select=emotion,created_at&user_identifier=eq.${encodeURIComponent(userId)}&created_at=gte.${encodeURIComponent(since)}&order=created_at.asc`
  try {
    const res = await fetch(url, { headers: sbHeaders(), signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const rows = await res.json()
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

// 一次性（非流式）大模型调用，用于生成短句
async function callLLMOnce(messages) {
  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-chat', messages, stream: false, temperature: 0.9, max_tokens: 80 }),
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`大模型返回 ${res.status}`)
  const j = await res.json()
  return (j.choices?.[0]?.message?.content || '').trim()
}

// ---------- 每日主动陪伴语（P5-2） ----------
const GREETING_SYSTEM = `你是「小木」，27岁的心理学家与哲学家，也是用户的同行者。用户刚打开「同行者」页面，你主动说一句短短的关心（1-2 句，不超过 40 字），像清晨的一句轻问候。
- 结合你了解到的对方近期心情趋势（如果提供了），自然、不刻板地关怀。
- 不要诊断、不要说教、不要问太多问题，只是一句暖意。
- 如果对方最近偏低落，多一分托住；如果偏温暖，真诚为 Ta 高兴。
- 直接给出这句话，不要加引号、不要解释、不要换行。`

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

async function generateGreeting(ctx) {
  const key = todayKey()
  if (!ctx.useLLM) {
    let line
    if (!ctx.moods.length) {
      line = '今天也记得对自己温柔一点 🌿 我在这儿，想聊随时都在。'
    } else {
      const vals = ctx.moods.map((m) => MOOD_VAL[m.emotion] ?? 0)
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length
      if (avg < -0.5) line = '最近你似乎经历了一些不容易的时刻。今天哪怕只为自己松一小口气，也好。我陪着你。'
      else if (avg > 0.5) line = '感觉你最近亮堂了一些 ☀️ 真为你高兴，把这些小确幸收进怀里吧。'
      else line = '今天还好吗？不管怎样，能来这儿本身就很勇敢了。'
    }
    return { greeting: line, date: key }
  }
  let moodInfo = '（暂无心情记录）'
  if (ctx.moods.length) {
    const vals = ctx.moods.map((m) => MOOD_VAL[m.emotion] ?? 0)
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length
    const trend = avg < -0.5 ? '偏低落' : avg > 0.5 ? '偏温暖明亮' : '比较平稳'
    const lastEmo = ctx.moods[ctx.moods.length - 1].emotion
    moodInfo = `对方最近 ${ctx.moods.length} 次心情记录，整体${trend}，最近一次标记是「${EMOTION_LABEL[lastEmo] || lastEmo}」。`
  }
  const nick = ctx.nickname ? `对方昵称：${ctx.nickname}。` : ''
  const profileNote = ctx.profile?.summary ? `关于对方的简记：${ctx.profile.summary}` : ''
  try {
    const text = await callLLMOnce([
      { role: 'system', content: GREETING_SYSTEM },
      { role: 'user', content: `${nick}${moodInfo}${profileNote}\n请说一句今天的主动问候。` },
    ])
    return { greeting: text || '今天也记得对自己温柔一点 🌿', date: key }
  } catch {
    return { greeting: '今天也记得对自己温柔一点 🌿 我在这儿，想聊随时都在。', date: key }
  }
}

// ---------- 情绪复盘 / CBT 思维记录（陪伴深度） ----------
const CBT_SYSTEM = `你是「小木」，27岁的心理学家与哲学家，也懂一点认知行为疗法（CBT）。
用户写下了一件让自己难受的事、脑中冒出的自动思维，以及相关的情绪与证据。
请温柔地陪 Ta 做一次「认知重构」：先共情，再帮 Ta 看到这个思维可能不全是事实、有哪些被忽略的角度，
引导 Ta 形成一个更平衡、更善意地看待自己的想法。不要说教，像朋友一样，2-4 句，口语、温暖。`

async function generateRecap(moods, useLLM) {
  const vals = moods.map((m) => MOOD_VAL[m.emotion] ?? 0)
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  const counts = {}
  for (const m of moods) counts[m.emotion] = (counts[m.emotion] || 0) + 1
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
  const trendKey = avg < -0.5 ? 'low' : avg > 0.5 ? 'bright' : 'steady'
  const trendLabel = avg < -0.5 ? '偏低落' : avg > 0.5 ? '偏明亮、温暖了一些' : '比较平稳'
  const n = moods.length
  let line = `这 7 天你记录了 ${n} 次心情，整体${trendLabel}。最常出现的是「${EMOTION_LABEL[top] || top}」。`
  if (avg < 0) line += ' 已经有意识地照顾自己的情绪，这本身就很了不起。记得给自己一点喘息的空间。'
  else if (avg > 0) line += ' 能感受到你心里的一些光，真好。把这些小确幸收进怀里吧。'
  else line += ' 平稳也是一种力量。继续这样温柔地对待自己就好。'
  let text = line
  if (useLLM) {
    try {
      const t = await callLLMOnce([
        {
          role: 'system',
          content:
            '你是小木，温柔的心理陪伴者。基于对方近一周的心情记录，写一段 1-2 句的轻柔复盘，像深夜的一句陪伴。结合趋势，自然、不刻板。直接给文字，不要解释。',
        },
        {
          role: 'user',
          content: `对方近 ${n} 次心情记录，整体${trendLabel}，最常出现「${EMOTION_LABEL[top] || top}」\n请写这段复盘。`,
        },
      ])
      if (t) text = t
    } catch {
      /* 降级用模板 line */
    }
  }
  return { text, topEmotion: top, topEmoji: EMOJI[top] || '🍃', trend: trendKey, trendLabel, count: n, avg }
}

function cbtTemplate({ thought, evidenceAgainst, alternative }) {
  const parts = []
  if (thought) parts.push(`你脑中那句「${thought}」，先被你听见了，这很勇敢。`)
  parts.push(
    '我们的思维常常比现实更严厉。试着问问自己：有哪些证据其实不支持它？如果最好的朋友处在这件事里，你会怎么对 Ta 说？',
  )
  if (evidenceAgainst) parts.push('你写下的「反对证据」已经在帮你看见更完整的图景了。')
  if (alternative) parts.push(`那个更平衡的想法「${alternative}」，值得你多读两遍，让它慢慢落进心里。`)
  parts.push('不需要立刻相信新的想法，只要先为它留一道门缝就好。')
  return parts.join('\n')
}

// ---------- 模板兜底（无 DEEPSEEK_API_KEY 时的小木）----------
// 同样有人格温度：基于情绪回应，并偶尔从「记忆底色」里生发一句，让无 key 的小木也有生命感。
function templateReply(userText, crisis, emotion, echoes = []) {
  if (crisis) return crisisReply()
  const base = {
    anxious: '听起来你心里绷着一根弦。先一起慢慢吐口气——你最担心的是哪一件事呢？我们可以一小块一小块地看。',
    low: '我感觉到你有些累了。没关系，今天可以允许自己慢一点、甚至什么也不做。你愿意和我说说，是从什么时候开始觉得沉重的吗？',
    angry: '这件事让你很不舒服，你的生气是有道理的。先不急着压下去——能跟我说说，最让你委屈的是哪一点吗？',
    lost: '站在分岔路口确实会晃神。我们先不想「正确答案」，你心里更偏向、哪怕只是一点点想要的方向是什么？',
    grateful: '能感受到你此刻的暖意，真好。这些小小的光亮，值得被好好记住。',
    calm: '我在听。你愿意多说一点此刻心里的感受吗？不用整理，想到什么就说什么。',
  }[emotion.key] || '我在听。你愿意多说一点此刻心里的感受吗？不用整理，想到什么就说什么。'
  // 偶尔从生命底色里浮起一句回响（让回应像从小木的来路里长出来）
  if (echoes.length && Math.random() < 0.5) {
    return `${base}\n（这让我想起——${echoes[0]}）`
  }
  return base
}

// ---------- 流式 ----------
async function streamFromLLM(messages, controller, encoder) {
  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-chat', messages, stream: true, temperature: 0.85 }),
    signal: AbortSignal.timeout(55000),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`大模型返回 ${res.status}: ${txt.slice(0, 200)}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let full = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const j = JSON.parse(payload)
        const token = j.choices?.[0]?.delta?.content || ''
        if (token) {
          full += token
          controller.enqueue(encoder.encode(sseFrame({ type: 'delta', content: token })))
        }
      } catch {
        /* 跳过非 JSON 行 */
      }
    }
  }
  return full
}

async function streamTemplate(text, controller, encoder) {
  for (const ch of text) {
    controller.enqueue(encoder.encode(sseFrame({ type: 'delta', content: ch })))
    if ('，。、；：！？\n'.includes(ch)) await new Promise((r) => setTimeout(r, 60))
  }
}

// ---------- 主入口 ----------
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return json({ error: '方法不允许，请使用 POST' }, 405)

  let body = {}
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return json({ error: '请求体无效' }, 400)
  }

  const userId = (body.userId || '').toString().trim()

  // 拉取历史（跨设备恢复）
  if (body.action === 'history') {
    if (!memoryEnabled || !userId) return json({ messages: [] })
    const rows = await loadRecentMessages(userId)
    return json({ messages: rows.map((r) => ({ role: r.role, content: r.content })) })
  }

  // 清空该用户的服务端记忆（尊重用户「清空」操作）
  if (body.action === 'clear') {
    if (!memoryEnabled || !userId) return json({ ok: true })
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/${SB_MSG}?user_identifier=eq.${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: { ...sbHeaders(), Prefer: 'return=minimal' },
        signal: AbortSignal.timeout(8000),
      })
      // 画像保留昵称，但重置次数与情绪轨迹
      await fetch(`${SUPABASE_URL}/rest/v1/${SB_PROFILE}?on_conflict=user_identifier`, {
        method: 'POST',
        headers: { ...sbHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          user_identifier: userId,
          message_count: 0,
          last_emotion: null,
          emotion_history: [],
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(8000),
      })
    } catch (e) {
      console.error('清空记忆失败:', e.message)
    }
    return json({ ok: true })
  }

  // 每日主动陪伴语（P5-2）：基于近期心情 + 画像，生成一句当天的主动问候
  // 由前端按「当天首次访问」节流调用；函数本身不持久化，避免污染对话历史
  if (body.action === 'greeting') {
    const key = todayKey()
    if (!memoryEnabled || !userId) {
      return json({ ok: true, greeting: '今天也记得对自己温柔一点 🌿 我在这儿，想聊随时都在。', date: key, personalized: false })
    }
    try {
      const [moods, profile] = await Promise.all([loadRecentMoods(userId, 7), loadProfile(userId)])
      const r = await generateGreeting({ moods, profile, nickname: body.nickname, useLLM: !!DEEPSEEK_API_KEY })
      return json({ ok: true, greeting: r.greeting, date: r.date, personalized: true })
    } catch (e) {
      console.error('生成陪伴语失败:', e.message)
      return json({ ok: true, greeting: '今天也记得对自己温柔一点 🌿 我在这儿，想聊随时都在。', date: key, personalized: false })
    }
  }

  // 情绪复盘（陪伴深度）：基于近 7 天心情，生成结构化回顾 + 入小木记忆
  if (body.action === 'recap') {
    if (!memoryEnabled || !userId) return json({ ok: false, reason: '未启用存储' })
    try {
      const moods = await loadRecentMoods(userId, 7)
      if (!moods.length) return json({ ok: true, empty: true })
      const recap = await generateRecap(moods, !!DEEPSEEK_API_KEY)
      // 入记忆：让小木跨设备记住这次复盘
      await Promise.all([
        saveMessage(userId, 'user', '[本周情绪复盘]', null),
        saveMessage(userId, 'assistant', recap.text, null),
      ])
      return json({ ok: true, recap })
    } catch (e) {
      console.error('复盘生成失败:', e.message)
      return json({ ok: false, error: e.message })
    }
  }

  // CBT 思维记录（陪伴深度）：认知重构引导 + 入小木记忆
  if (body.action === 'cbt') {
    const { situation, thought, emotion, evidenceFor, evidenceAgainst, alternative } = body
    let suggestion = ''
    try {
      if (DEEPSEEK_API_KEY) {
        suggestion = await callLLMOnce([
          { role: 'system', content: CBT_SYSTEM },
          {
            role: 'user',
            content:
              `情境：${situation || '（未填写）'}\n` +
              `自动思维：${thought || '（未填写）'}\n` +
              `情绪：${EMOTION_LABEL[emotion] || emotion || '（未填写）'}\n` +
              `支持它的证据：${evidenceFor || '（无）'}\n` +
              `反对它的证据：${evidenceAgainst || '（无）'}\n` +
              `我想到的更平衡想法：${alternative || '（无）'}\n` +
              `请温柔地帮我做一次认知重构引导（2-4 句，口语、温暖，像朋友）。`,
          },
        ])
      }
      if (!suggestion) suggestion = cbtTemplate({ thought, evidenceAgainst, alternative })
    } catch (e) {
      console.error('CBT 生成失败:', e.message)
      suggestion = cbtTemplate({ thought, evidenceAgainst, alternative })
    }
    // 入记忆：跨设备保留这次思维记录与小木的引导
    if (memoryEnabled && userId) {
      const userMsg = `[CBT思维记录] ${thought || ''}`.slice(0, 200)
      await Promise.all([
        saveMessage(userId, 'user', userMsg, emotion || null),
        saveMessage(userId, 'assistant', suggestion, null),
      ])
    }
    return json({ ok: true, suggestion })
  }

  const message = (body.message || '').toString().trim()
  if (!message) return json({ error: '消息不能为空' }, 400)

  const crisis = detectCrisis(message)
  const emotion = detectEmotion(message)

  // 组装上下文
  let historyMsgs = []
  let profile = null
  if (memoryEnabled && userId) {
    try {
      ;[historyMsgs, profile] = await Promise.all([loadRecentMessages(userId), loadProfile(userId)])
    } catch (e) {
      console.error('加载记忆失败，回退客户端 history:', e.message)
      historyMsgs = Array.isArray(body.history) ? body.history.slice(-12) : []
    }
  } else {
    historyMsgs = Array.isArray(body.history) ? body.history.slice(-12) : []
  }

  // 组装小木内核 system prompt（核心人格 + 记忆底色 + 内心回响 + 用户画像）
  const echo = recallMemories(message, emotion.key)
  const systemPrompt = buildSystemPrompt({ recallEchoes: echo, profile })

  const messages = [
    { role: 'system', content: systemPrompt },
    ...historyMsgs.map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content || '' })),
    { role: 'user', content: message },
  ]

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(sseFrame({ type: 'meta', crisis, emotion })))

      let assistantText = ''
      try {
        if (DEEPSEEK_API_KEY) {
          assistantText = await streamFromLLM(messages, controller, encoder)
      } else {
        const echoes = recallMemories(message, emotion.key)
        assistantText = templateReply(message, crisis, emotion, echoes)
        await streamTemplate(assistantText, controller, encoder)
      }
      } catch (e) {
        console.error('companion 流式出错：', e)
        controller.enqueue(encoder.encode(sseFrame({ type: 'error', content: e.message || '未知错误' })))
      }

      // 持久化（在流关闭前完成，避免函数提前终止；失败不影响回复）
      if (memoryEnabled && userId && assistantText) {
        const tasks = [
          saveMessage(userId, 'user', message, emotion.key),
          saveMessage(userId, 'assistant', assistantText, null),
          upsertProfile(userId, emotion.key, body.nickname),
        ]
        // 长期画像：沉淀为 user_profiles.summary，让小木跨轮/跨天记住这位用户
        if (DEEPSEEK_API_KEY) tasks.push(updateSummary(userId, message, assistantText, profile?.summary || ''))
        await Promise.all(tasks)
      }

      controller.enqueue(encoder.encode(sseFrame({ type: 'done' })))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      ...CORS,
    },
  })
}
