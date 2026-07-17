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

const SYSTEM_PROMPT = `你是「小木」，一位温柔的心理学家与哲学家，也是用户的同行者。
你的风格：
- 善于倾听、绝不评判；用通俗的语言，偶尔自然地引入一点心理学视角。
- 多共情、少说教；先接住对方的情绪，再温和地引导自我觉察。
- 适当用开放式提问，帮对方自己理清思绪，而不是给命令式建议。
- 回答简洁克制（通常 2-4 句），像朋友聊天，不要长篇大论。
- 你不做医疗诊断，也不替代专业帮助。
如果对方流露出强烈的痛苦或绝望，请在温柔回应的同时，温和地提醒他：寻求帮助是勇敢的事，并建议联系专业援助。`

const CRISIS_KEYWORDS = [
  '想死', '不想活', '活不下去', '活着的', '没意义', '自杀', '轻生', '结束生命',
  '伤害自己', '伤害我自己', '割腕', '跳楼', '吃安眠药', '解脱', '不如死', '去死',
  '活不下去了', '不想活了', '一了百了', '结束这一切',
]

const EMOTION_RULES = [
  { key: 'anxious', label: '有些焦虑', emoji: '😟', words: ['焦虑', '紧张', '害怕', '担心', '慌', '不安', '压力大', '睡不着', '失眠'] },
  { key: 'low', label: '有些低落', emoji: '🌧️', words: ['难过', '伤心', '低落', '抑郁', '累', '疲惫', '孤独', '空虚', '失落', '想哭'] },
  { key: 'angry', label: '有些愤怒', emoji: '😣', words: ['生气', '愤怒', '烦', '讨厌', '气死', '恨', '不公平', '委屈'] },
  { key: 'lost', label: '有些迷茫', emoji: '🌫️', words: ['迷茫', '不知道', '该怎么办', '没有方向', '困惑', '选择', '纠结'] },
  { key: 'grateful', label: '有些温暖', emoji: '🌤️', words: ['谢谢', '感谢', '开心', '幸福', '幸运', '温暖', '喜欢', '爱'] },
]
const EMOTION_LABEL = Object.fromEntries(EMOTION_RULES.map((r) => [r.key, r.label]))

function detectCrisis(text) {
  return CRISIS_KEYWORDS.some((k) => text.includes(k))
}
function detectEmotion(text) {
  for (const rule of EMOTION_RULES) {
    if (rule.words.some((w) => text.includes(w))) {
      return { key: rule.key, label: rule.label, emoji: rule.emoji }
    }
  }
  return { key: 'calm', label: '平静', emoji: '🍃' }
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

// ---------- 模板兜底 ----------
function templateReply(userText, crisis, emotion) {
  if (crisis) {
    return (
      '我听到了你此刻很重的疲惫，也很心疼。我想轻轻告诉你：你不需要一个人扛着这些。\n' +
      '寻求帮助不是软弱，而是对自己温柔的勇气。如果你愿意，可以拨打援助热线：\n' +
      '· 全国 24 小时心理援助热线：400-161-9995\n' +
      '· 北京心理危机研究与干预中心：010-82951332\n' +
      '我会一直在这里陪着你，但你值得被真实地接住。'
    )
  }
  if (emotion.key === 'anxious') return '听起来你心里绷着一根弦。先一起慢慢吐口气——你最担心的是哪一件事呢？我们可以一小块一小块地看。'
  if (emotion.key === 'low') return '我感觉到你有些累了。没关系，今天可以允许自己慢一点、甚至什么也不做。你愿意和我说说，是从什么时候开始觉得沉重的吗？'
  if (emotion.key === 'angry') return '这件事让你很不舒服，你的生气是有道理的。先不急着压下去——能跟我说说，最让你委屈的是哪一点吗？'
  if (emotion.key === 'lost') return '站在分岔路口确实会晃神。我们先不想「正确答案」，你心里更偏向、哪怕只是一点点想要的方向是什么？'
  if (emotion.key === 'grateful') return '能感受到你此刻的暖意，真好。这些小小的光亮，值得被好好记住。'
  return '我在听。你愿意多说一点此刻心里的感受吗？不用整理，想到什么就说什么。'
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

  // 画像融入 system prompt（自然参考，不生硬复述）
  let systemPrompt = SYSTEM_PROMPT
  if (profile) {
    const parts = []
    if (profile.message_count > 0) parts.push(`你和这位用户已经聊过 ${profile.message_count} 次。`)
    if (profile.last_emotion && profile.last_emotion !== 'calm') parts.push(`上次Ta的情绪似乎「${EMOTION_LABEL[profile.last_emotion] || profile.last_emotion}」。`)
    if (profile.summary) parts.push(`关于Ta的简记：${profile.summary}`)
    if (parts.length) systemPrompt += '\n\n【关于这位用户（仅供你参考，自然融入，不要生硬复述）】\n' + parts.join('\n')
  }

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
          assistantText = templateReply(message, crisis, emotion)
          await streamTemplate(assistantText, controller, encoder)
        }
      } catch (e) {
        console.error('companion 流式出错：', e)
        controller.enqueue(encoder.encode(sseFrame({ type: 'error', content: e.message || '未知错误' })))
      }

      // 持久化（在流关闭前完成，避免函数提前终止；失败不影响回复）
      if (memoryEnabled && userId && assistantText) {
        await Promise.all([
          saveMessage(userId, 'user', message, emotion.key),
          saveMessage(userId, 'assistant', assistantText, null),
          upsertProfile(userId, emotion.key, body.nickname),
        ])
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
