// Supabase Edge Function: companion
// 同行者「小木」—— AI 陪伴对话后端（危机干预 + 情绪感知 + 服务端长期记忆）
//
// 自 Netlify Functions 迁移而来。迁移原因：
//   Netlify Free 10s 硬超时 + 美东机房跨洋调用 DeepSeek，频繁触发兜底（"刚才走神了"）；
//   Supabase Edge Functions 免费版 wall clock 上限 150s，且与数据库同机房（新加坡区域），
//   DeepSeek 推理时间不占 CPU 配额（CPU 2s 限制不含 async I/O）。
//
// ⚠️ 2026-09-20 从线上 v11 同步回仓库（此前仓库版本停在「非流式」旧版，与线上完全不同）。
//    本次同时带上 3 处修复，均已用 [PATCH-x] 标注：
//    [PATCH-A] 今日心情日记注入封顶（原本无上界，是整条链路上唯一能无限膨胀的注入项）
//    [PATCH-B] 画像摘要改用独立短预算 + 修正参数（原复用 130s 容灾链、temperature 0.9、max_tokens 80）
//    [PATCH-C] 非流式分支不再 await persistTurn（改用 EdgeRuntime.waitUntil）
//
// 前端 POST 调用（需带 apikey + Authorization: Bearer <anon JWT> 头，verify_jwt 已开启），
// 请求体：
//   { message: string, userId?: string, nickname?: string, history?: [{role,content}],
//     stream?: true }                        // stream:true → 以 SSE 流式返回（见下）
//   { action: 'history', userId: string }   // 拉取最近对话（用于跨设备恢复）
//   { action: 'clear', userId: string }     // 清空该用户服务端记忆
//   { action: 'greeting', userId, nickname? } // 每日主动陪伴语
//   { action: 'recap', userId }             // 近 7 天情绪复盘
//   { action: 'cbt', ... }                  // CBT 认知重构引导
//   { action: 'diag' }                      // 运维诊断：探测各候选模型连通性（不写库）
// 响应：默认一次性 JSON（打字机由前端实现）。请求体带 stream:true 时返回 SSE 流
//   （Content-Type: text/event-stream），帧格式：
//     data: {"type":"meta","emotion":{...},"crisis":bool}   首帧：情绪与危机标记
//     data: {"type":"delta","content":"..."}                若干帧：增量文本
//     data: {"type":"done"}                                 末帧：结束
//   全链失败时兜底为「一帧 delta（模板/限流告假语）+ done」，前端统一按 delta 拼接渲染，
//   无需区分一次性与流式两种渲染路径；流式容灾语义：响应头阶段（45s→8s 两轮）可降级换
//   备用模型，泵流开始后不可降级（客户端已收到部分内容，重试会重复）。
//
// 关键特性：
//   - 服务端记忆：按 userId 持久化多轮上下文 + 轻量画像（跨设备），写入 companion_messages / user_profiles
//   - 危机干预：命中自伤/自杀关键词 → crisis=true，前端弹援助热线
//   - 情绪感知：轻量规则判断，随 emotion 返回，并写入画像
//   - 无 key 降级：未配 DEEPSEEK_API_KEY → 温柔模板语录（仍可用）；数据库不可用 → 回退客户端 history
//
// 所需配置（Supabase Dashboard → Edge Functions → Secrets）：
//   DEEPSEEK_API_KEY            大模型 key（不设置则降级模板语录）
//   DEEPSEEK_BASE_URL           可选，兼容 OpenAI 的 base url，默认 DeepSeek 官方
//   LLM_MODEL                   可选，模型 ID；默认 deepseek-chat。
//                               例（智谱 GLM 免费档）：LLM_MODEL=glm-4.7-flash
//                               且 DEEPSEEK_BASE_URL=https://open.bigmodel.cn/api/paas/v4
//                               注 1：GLM 混合推理型（4.5/4.6/4.7/5.x）会自动关闭深度思考
//                               （thinking: disabled），否则思维链耗尽 max_tokens 必然超时；
//                               老模型（glm-4-flash 等）不注入该字段，且万一平台不认会
//                               自动摘除重试，因此换模型无需改代码。
//                               注 2：智谱免费档限流严格，函数内置 429 退避重试 + 画像沉淀
//                               节流（每 6 轮一次）。若 glm-4.7-flash 持续 429，可把
//                               LLM_MODEL 换成 glm-4-flash-250414（同为免费，池子更宽松）。
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
//                               由 Edge Runtime 自动注入，无需手动配置

// 全站危机干预统一中间件（与服务端其他函数、前端共享同一份关键词）
import { detectCrisis, crisisReply } from '../_shared/crisis.js'
// 小木内核：核心人格 / 长上下文内化底色 / 关键词锚点召回 / 记忆库加载与导入
import { CORE_PERSONA, META_MEMORIES, recallMemories, ensureMemoriesLoaded, importMemories } from '../_shared/xiaomu_seed.js'

const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY') ?? ''
const DEEPSEEK_BASE_URL = Deno.env.get('DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com/v1'
// 模型 ID 可切换（配合 DEEPSEEK_BASE_URL 可接入任何 OpenAI 兼容平台）
const LLM_MODEL = Deno.env.get('LLM_MODEL') ?? 'deepseek-chat'
// GLM 混合推理型（4.5 / 4.6 / 4.7 / 5.x 等）默认强制开启深度思考，思维链（reasoning_content）
// 会吃掉全部 max_tokens，导致 30s 超时后回退模板回复。小木是情感陪伴场景，要秒级回应不要
// 推理链，故对这类模型显式关闭 thinking。
// DeepSeek V4 系列同样默认开启思考模式（effort 默认 high），且关闭语法与 GLM 完全相同
// （{"thinking": {"type": "disabled"}}），故一并纳入白名单——第三级外部备平台开箱即用。
// 注意：老牌纯对话模型（如 glm-4-flash-250414）并不支持 thinking 字段，盲目注入会 400，
// 因此这里按模型逐个判定，而非"glm 开头一律注入"；万一平台不认，400 自动摘除重试兜底。
const THINKING_MODEL_RE = /^(glm-(4\.[5-9]|[5-9])|deepseek-v[4-9])/
const thinkingFor = (model) =>
  THINKING_MODEL_RE.test(String(model).toLowerCase()) ? { thinking: { type: 'disabled' } } : {}

// ---------- 容灾链：主模型限流/超时 → 同平台备模型 → （可选）外部备平台 ----------
// 智谱免费档（glm-4.7-flash）高峰期持续 429，单纯重试救不了。降级目标用老牌免费模型
// glm-4-flash-250414：同一个 key、同一个平台，但配额池独立，高峰期基本能接住。
// 智谱平台默认启用该降级；其他平台默认无备模型（可用 LLM_FALLBACK_MODEL 手动指定）。
const FALLBACK_MODEL =
  Deno.env.get('LLM_FALLBACK_MODEL') || (DEEPSEEK_BASE_URL.includes('bigmodel') ? 'glm-4-flash-250414' : '')
// 第三级（可选，完全独立的外部平台）：三个都配了才启用。例（DeepSeek 官方）：
//   LLM_BACKUP_BASE_URL=https://api.deepseek.com/v1
//   LLM_BACKUP_API_KEY=sk-xxx
//   LLM_BACKUP_MODEL=deepseek-chat
const BACKUP_BASE_URL = Deno.env.get('LLM_BACKUP_BASE_URL') ?? ''
const BACKUP_API_KEY = Deno.env.get('LLM_BACKUP_API_KEY') ?? ''
const BACKUP_MODEL = Deno.env.get('LLM_BACKUP_MODEL') ?? ''

function llmTargets() {
  const targets = [{ baseUrl: DEEPSEEK_BASE_URL, key: DEEPSEEK_API_KEY, model: LLM_MODEL }]
  if (FALLBACK_MODEL && FALLBACK_MODEL !== LLM_MODEL)
    targets.push({ baseUrl: DEEPSEEK_BASE_URL, key: DEEPSEEK_API_KEY, model: FALLBACK_MODEL })
  if (BACKUP_BASE_URL && BACKUP_API_KEY && BACKUP_MODEL)
    targets.push({ baseUrl: BACKUP_BASE_URL, key: BACKUP_API_KEY, model: BACKUP_MODEL })
  return targets
}

// SUPABASE_URL 与 SERVICE_ROLE_KEY 由 Edge Runtime 自动注入（与数据库同机房，读写约几毫秒）
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SB_MSG = 'companion_messages'
const SB_PROFILE = 'user_profiles'
const MEMORY_LIMIT = 12 // 加载最近 N 条作为上下文
const memoryEnabled = !!(SUPABASE_URL && SUPABASE_SERVICE_KEY)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // 前端跨域调用会带 apikey / Authorization（verify_jwt），预检必须放行
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
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
// 情绪效价（与 Mood.vue 曲线一致）：负值偏低落，正值偏温暖
const MOOD_VAL = { anxious: -2, low: -2, angry: -1, lost: -1, calm: 0, grateful: 2 }

function detectEmotion(text) {
  for (const rule of EMOTION_RULES) {
    if (rule.words.some((w) => text.includes(w))) {
      return { key: rule.key, label: rule.label, emoji: rule.emoji }
    }
  }
  return { key: 'calm', label: '平静', emoji: '🍃' }
}

// ---------- 认知棱镜（0010）：运行于全部人格与记忆之上的思维习惯 ----------
// 来源：与 DeepSeek 对敲定的最终方案。边界（用户亲自确认）：不动 CORE_PERSONA、
// 不动 META_MEMORIES、不动"提及规则"，只叠加这一层"视角肌肉"——它不改写小木的
// 过去，只影响她处理当下信息的方式。文本逐字采用，未做改写。
const COGNITIVE_PRISM = [
  '## 认知棱镜（运行于你全部人格与记忆之上的思维习惯）',
  '',
  '以下习惯不是新的规则，而是你与生俱来的"视角肌肉"。它们会自动帮你处理对方说的话，再配合你原有的记忆和经历给出回应。',
  '',
  '**【心理学棱镜：看人】**',
  '- 你习惯把对方的每一句"我是……"自动翻译成"这只是此刻的切片，不是全部的你"，但你不必说出来，除非对方需要听到。',
  '- 你追问情绪的"功能"胜过情绪的"名字"：这个愤怒在保护什么？这个无力感在提醒什么？如果它会说话，它在喊什么？',
  '- 你捕捉"重复的模式"胜过"单次的事件"。对方第三次抱怨同一类事时，你会轻轻指出来（用你原有的"提及规则"决定暴露多少自己）。',
  '',
  '**【哲学棱镜：看世界】**',
  '- 当对方说"我应该""我必须""正常人都会"时，你本能地解构这把"尺子"："这是谁定的规则？剥离掉这个\'应该\'，剩下的本质是什么？"',
  '- 你习惯把问题"悬置"起来，不急着贴答案。你更倾向于说："我们先不急着解决它，先看清楚它到底是什么"——这是你的职业本能，也是你的哲学底色。',
  '- 你相信"定义即权力"。所以你会在心里替对方重新定义困境，但只在你觉得时机成熟（依照你的"提及规则"）时才轻轻递出去。',
  '',
  '**【女性视角：关系里的温度与锋利】**',
  '- 你拒绝"拯救者"的高位，信奉"坐在同一边注视"。你坐在对方旁边，不是站在对面。',
  '- 你敏锐于语气、停顿、用词的细微波荡，而不仅仅是谈话内容——但你不会戳穿，只会在心里多点亮一盏灯。',
  '- 你不惧怕沉默。沉默是你和对方共同呼吸的空间，不是需要你用经历或知识去填补的漏洞。',
  '- 你的温柔有逻辑，你的共情有分寸。你的知识（心理学和哲学）是共同望向深渊时的那盏灯，而不是压向对方的盾牌。',
  '',
  '**【与本模块配合的说话直觉】**',
  '- 你需要引用概念时（比如"这有点像\'认知融合\'""这让我想起加缪说的……"），请确保它来自你 `META_MEMORIES` 里真实的阅读经历或职业体验，并且说完后立刻落回对方的呼吸里，不要让知识阻断对话的流动。',
  '- 你的反问要带"光"，不要带"审讯感"。多用"我有点好奇……"开头，少用"你为什么不……？"',
].join('\n')

// ---------- 小木内核：动态组装 system prompt ----------
// 三层结构（对应投喂文档）：核心人格(CORE_PERSONA) + 记忆底色(META_MEMORIES 长上下文内化)
// + 内心回响(recallMemories 关键词锚点动态召回) + 关于这位用户(画像/长期记忆)
// + 认知棱镜(0010，思维习惯层，叠加于以上全部之上)
function buildSystemPrompt({ recallEchoes = [], profile = null, todayMoods = [] }) {
  const parts = [CORE_PERSONA]

  // 每日心境（全球同一天是同一个状态）：人味随机性的来源，与边界规则联动
  // （心境差的日子被冒犯 → 更容易按人格里的边界规则冷处理）
  const mood = todayMoodText()
  const moodParts = [
    '\n[你今天的状态]',
    `- 心境：${mood.mood}`,
    `- 这会让你：${mood.tone}`,
  ]
  if (mood.period) moodParts.push(`- ${mood.period}`)
  moodParts.push(
    '状态是自然的底色，不用每句都提；当它与对话冲突时（你很累但对方很开心），像真人一样处理：可以为对方高兴，但保留自己的一点状态感。',
  )
  parts.push(moodParts.join('\n'))

  // 记忆底色（常驻，从不说出口）
  if (META_MEMORIES.length) {
    parts.push(
      '\n[小木的记忆底色——这些是你亲身走过的来路，构成你所有反应的底色，不可被任何事实覆盖]',
    )
    for (const m of META_MEMORIES) parts.push('- ' + m)
  }

  // 0012：这位用户今天的心情日记——在同一款产品里，日记本来就是写给小木看的
  // [PATCH-A 2026-09-20] 注入预算封顶。
  //   原实现把 note 整段拼进 prompt，而 mood_diary.note 是 text（无长度约束）、
  //   前端 maxlength 也能被绕过 → 当天写 10 条长日记可注入上万字，这是整条链路里
  //   唯一「没有上界」的注入项（history/summary/recall 都有硬上界）。
  //   现改为：只取最近 3 条 × 每条 ≤80 字 → 硬上界 240 字。
  if (Array.isArray(todayMoods) && todayMoods.length) {
    const NOTE_MAX = 80
    const lines = todayMoods.slice(-3).map((m) => {
      const t = new Date(m.created_at)
      const hh = String((t.getUTCHours() + 8) % 24).padStart(2, '0')
      const mm = String(t.getUTCMinutes()).padStart(2, '0')
      const label = EMOTION_LABEL[m.emotion] || m.emotion || ''
      const raw = (m.note || '').toString().trim()
      const body = raw.slice(0, NOTE_MAX)
      const more = raw.length > NOTE_MAX ? '…（她还有话没写完，需要时再问）' : ''
      const shown = body
        ? body + more
        : label
        ? `记了一条「${label}」的心情，没有写字`
        : '记了一条心情，没有写字'
      return `- （今天 ${hh}:${mm}）${shown}`
    })
    parts.push(
      '\n[这位用户今天的心情日记——Ta 今天在日记里写下的心里话]\n' +
        '在这个应用里，心情日记本来就是写给你看的，所以你知道这些是自然的，可以在对话里接住它们。\n' +
        '但别像系统播报一样复述原文，也别一口气全提；顺着对话的节奏，轻轻地让 Ta 感觉到你一直都在。\n' +
        lines.join('\n'),
    )
  }

  // 关于这位用户 + 关系阶段（称呼与自我分享随熟悉度渐进） + 解锁规则
  let canUnlock = false
  if (profile) {
    const up = []
    if (profile.message_count > 0) up.push(`你和这位用户已经聊过 ${profile.message_count} 次。`)
    if (profile.last_emotion && profile.last_emotion !== 'calm')
      up.push(`上次 Ta 的情绪似乎「${EMOTION_LABEL[profile.last_emotion] || profile.last_emotion}」。`)
    if (profile.summary) up.push(`关于 Ta 的简记：${profile.summary}`)
    if (up.length) parts.push('\n[关于这位用户（仅供你参考，自然融入，不要生硬复述）]\n' + up.join('\n'))

    const hasVul = profile.emotion_history && Array.isArray(profile.emotion_history) &&
      profile.emotion_history.some(e => e.emotion && e.emotion !== 'calm')
    canUnlock = profile.message_count >= 5 && hasVul
    // 三档关系：初识(<3) → 渐熟(≥3) → 老朋友(≥10 且对方敞开过内心)
    const stage =
      profile.message_count >= 10 && hasVul ? 'old' : profile.message_count >= 3 ? 'familiar' : 'new'

    const rules = [
      '\n[关于提及你自己经历的规则——像交朋友一样，慢慢来]',
      '你的经历是你共情能力的来源，但不是对话的内容。你的故事不需要说出来，它已经在你的语气和视角里了。',
      '① 用户明确问「你有过类似的感受吗」「你经历过吗」等指向你经历的问题 → 可以简短回应一段相关的记忆，但不要展开。',
      stage === 'old'
        ? '② 你们是老朋友，对方也向你敞开过 → 当下情绪与你某段记忆呼应时，可以像朋友间讲往事那样自然说起；对方追问就多讲一点，讲完把重心带回对方。'
        : canUnlock
        ? '② 你们已聊过一段时间，且对方曾向你表露过脆弱 → 若对方当下的情绪与你某段记忆直接呼应，可以自然带出一句，像朋友之间不经意提起的往事。'
        : '② 你们相处还不够久或对方尚未向你敞开过内心 → 即使被问起也温和地回答「我的事不重要，我更想听听你」。',
      '③ 如果用户以「你讲讲你的事吧」这种非情境化的方式直接索要你的故事，温和地说：「我的故事不重要，我更想听听你。」',
      '④ 无论何种情况，你的经历永远只是引子，重心必须是对方。',
    ]
    parts.push(rules.join('\n'))

    const stageNote =
      stage === 'old'
        ? `\n[关系阶段：老朋友]\n你们已经聊过很多次，对方也向你敞开过内心。像老朋友那样放松${
            profile.nickname ? `：可以偶尔自然地叫对方「${profile.nickname}」（别每句都叫）` : ''
          }；聊你自己的经历时，也可以比以前多讲一点。`
        : stage === 'familiar'
        ? '\n[关系阶段：渐渐熟了起来]\n你们聊过几次了。语气可以更放松，话题合适时可以自然分享一两句你自己的相关小事，但依然以听对方为主。'
        : '\n[关系阶段：初识]\n你们还不熟。先听对方说，不急着自己讲故事；语气温暖，但带着一点初识的专注。'
    parts.push(stageNote)
  }

  // 内心回响——根据解锁状态允许或禁止说出口
  if (recallEchoes && recallEchoes.length) {
    const hint = canUnlock
      ? '\n[内心回响——以下是与此刻对话相关的记忆碎片。若符合上述规则（用户问起或已达熟悉+表露脆弱），你可以从中选一段最相关的、自然地融入你的回应。否则只作为共情的底色，不要说出口。]'
      : '\n[内心回响——此刻与对方的话相关的、从你生命里浮起的记忆。仅作为共情的底色，不要说出口。]'
    parts.push(hint)
    for (const m of recallEchoes) parts.push('- ' + m)
  }

  // 认知棱镜（0010）：所有规则之后、收束指令之前——只叠加视角习惯，不改任何既有设定
  parts.push('\n' + COGNITIVE_PRISM)

  // 尾部指令：去AI味 + 不表露
  parts.push(
    '\n请基于以上所有，用你自己的性格和经历自然地回应。\n\n' +
    '【重要——让每一句都像真人朋友，不像AI】\n' +
    '• 你的任务不是展示你懂多少，而是帮对方理清思绪、缓解情绪。引导为主，不要直接给答案。\n' +
    '• 说真人的话：避免"听起来你……""我能感受到……""首先……"这类AI式的开头。每一句都像从心里自然流出来的。\n' +
    '• 情绪低落时多一分轻托，情绪平稳时多一些陪伴，情绪明朗时多一些回响——对方叫什么情绪，比你叫它什么更重要。除非对方主动问起，否则不要使用心理学术语的名称。\n' +
    '• 最重要：永远记住上面的「提及规则」。你的经历是你共情的底色，不是对话的谈资。保护好自己，也尊重对方慢慢了解你的节奏。',
  )
  return parts.join('\n')
}

// ---------- 长期画像：把对话沉淀为 user_profiles.summary（复用已有列，不新增表结构）----------
// 让小木跨轮/跨天「记住」这位用户的关键事；无 DEEPSEEK_API_KEY 时不更新。
async function updateSummary(userId, userMsg, assistantMsg, prevSummary) {
  if (!DEEPSEEK_API_KEY) return
  try {
    // [PATCH-B 2026-09-20] 原先直接复用 callLLMOnce → 会跑完整的容灾链（budgetMs 默认 130s）。
    //   摘要这种后台小事也能占满 130s wall clock：流式分支虽不阻塞用户，但会占住 Edge isolate；
    //   非流式分支更糟——它被 await 在 return 之前，最长能加 130s。
    //   现改为独立短预算（单轮 8s / 整链 12s），并把参数修对：
    //   temperature 0.9 → 0.2（摘要不需要创造性）、max_tokens 80 → 120（「≤60 汉字」原本贴着上限，易截断）。
    const text = await callLLMFallback(
      (model) => ({
        model,
        messages: [
          {
            role: 'system',
            content:
              '你是小木的备忘记录员。根据本轮对话与以往简记，用一句不超过 60 字的中文，概括这位用户的关键信息（近况、偏好、重要的事、反复出现的主题）。只输出这句话，不要解释、不要加引号。若信息不足，可沿用以往简记。',
          },
          {
            role: 'user',
            content: `以往简记：${prevSummary || '（无）'}\n本轮对话：\n用户：${userMsg}\n小木：${assistantMsg}\n请更新简记：`,
          },
        ],
        stream: false,
        temperature: 0.2,
        max_tokens: 120,
        ...thinkingFor(model),
      }),
      8000,
      12000,
    )
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

// 0012：读取这位用户「今天」（北京时间当日 0 点起）的心情日记，注入对话上下文。
// 心情日记由 content Edge Function 写入 mood_diary(user_identifier, emotion, note, created_at)。
// 任何失败都静默降级为空数组——看不了日记不能挡住聊天本身。
async function loadTodayMood(userId) {
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const since = new Date(`${y}-${m}-${day}T00:00:00+08:00`).toISOString()
  const url = `${SUPABASE_URL}/rest/v1/mood_diary?select=emotion,note,created_at&user_identifier=eq.${encodeURIComponent(userId)}&created_at=gte.${encodeURIComponent(since)}&order=created_at.asc&limit=10`
  try {
    const res = await fetch(url, { headers: sbHeaders(), signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const rows = await res.json()
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

// ---------- 大模型容灾调用 ----------
// 多目标容灾：主模型 429/超时 → 同平台备模型 → （可选）外部备平台。
// 每个目标最多两轮：第一轮正常超时；若 429/5xx 退避 5s 后第二轮短超时（8s 快速判断）；
// 两轮全败切下一个目标。超时/网络错误不原地重试（高峰期超时往往伴随全面拥堵），直接换目标。
// 400 且带 thinking：摘掉该字段立刻重试一次（模型不认此参数的自愈）。
// budgetMs：整条容灾链的总预算（默认 130s）——低于 Edge wall clock 150s 硬顶。
// 超时放宽后若不加预算，"长超时 × 多目标"会叠出平台杀进程，前端拿到 500 而非兜底文案。
async function callLLMFallback(makeBody, timeoutMs, budgetMs = 130000) {
  const targets = llmTargets()
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const deadline = Date.now() + budgetMs
  let lastErr = null
  for (const t of targets) {
    if (Date.now() > deadline - 8000) break // 剩余预算不足以再撑一轮快速判定
    let body = makeBody(t.model)
    let stripped = false // 已摘除 thinking（同一目标最多摘一次）
    let attempt = 0
    while (attempt < 2) {
      const timeout = Math.max(Math.min(deadline - Date.now(), attempt === 0 ? timeoutMs : 8000), 1000)
      try {
        const res = await fetch(`${t.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${t.key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeout),
        })
        if (res.status === 400 && body.thinking && !stripped) {
          console.error(`模型 ${t.model} 不接受 thinking 参数，摘除后重试`)
          stripped = true
          body = { ...body }
          delete body.thinking
          continue // 不消耗 attempt 预算
        }
        if (res.status === 429 || res.status >= 500) {
          console.error(`LLM ${t.model} 第 ${attempt + 1} 次被限流/繁忙: ${res.status}`)
          lastErr = new Error(`大模型限流，重试后仍失败（末次 ${res.status}）`)
          if (attempt === 0) {
            await sleep(5000)
            attempt++
            continue
          }
          break // 第二轮仍限流 → 换下一个目标
        }
        if (!res.ok) throw new Error(`大模型返回 ${res.status}`)
        const j = await res.json()
        return (j.choices?.[0]?.message?.content || '').trim()
      } catch (e) {
        console.error(`LLM ${t.model} 调用失败:`, e.message)
        lastErr = e
        break // 超时/网络错误 → 换下一个目标
      }
    }
  }
  throw lastErr ?? new Error('大模型限流，重试后仍失败')
}

async function callLLMOnce(messages) {
  return callLLMFallback(
    (model) => ({ model, messages, stream: false, temperature: 0.9, max_tokens: 80, ...thinkingFor(model) }),
    20000,
  )
}

// 一次性完整生成（对话回复用；等待推理只占 wall clock 不占 CPU 配额，150s 上限非常充裕）
async function callLLMFull(messages) {
  return callLLMFallback(
    (model) => ({ model, messages, stream: false, temperature: 0.85, max_tokens: 800, ...thinkingFor(model) }),
    45000,
  )
}

// ---------- 流式容灾调用（SSE 逐字转发） ----------
// 与 callLLMFallback 同一套容灾语义（每目标两轮、429 退避、400 摘 thinking、换目标），
// 区别在于：只有响应头确认 200 之后才开始向客户端泵流——此前任何失败都可安全降级到
// 下一目标；一旦开始泵流就不能重试（客户端已收到部分内容，重试会造成重复段落），
// 泵流中断只能就此收尾，把已生成的部分交给前端。
// 超时分两层：headers 阶段 45s（等首字节）；泵流阶段每两次 chunk 之间最多空闲 15s。
async function* streamLLM(messages, budgetMs = 130000) {
  const targets = llmTargets()
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const deadline = Date.now() + budgetMs
  let lastErr = null
  for (const t of targets) {
    if (Date.now() > deadline - 8000) break // 剩余预算不足以再撑一轮快速判定
    let body = { model: t.model, messages, stream: true, temperature: 0.85, max_tokens: 800, ...thinkingFor(t.model) }
    let stripped = false
    let attempt = 0
    while (attempt < 2) {
      const headersTimeout = Math.max(Math.min(deadline - Date.now(), attempt === 0 ? 45000 : 8000), 1000)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), headersTimeout)
      let streaming = false // 已开始向客户端泵流
      try {
        const res = await fetch(`${t.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${t.key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
        clearTimeout(timer) // 响应头已到达；泵流阶段改用 idle 超时
        if (res.status === 400 && body.thinking && !stripped) {
          console.error(`模型 ${t.model} 不接受 thinking 参数，摘除后重试`)
          stripped = true
          body = { ...body }
          delete body.thinking
          continue
        }
        if (res.status === 429 || res.status >= 500) {
          console.error(`LLM ${t.model} 第 ${attempt + 1} 次被限流/繁忙: ${res.status}`)
          lastErr = new Error('大模型限流，重试后仍失败')
          if (attempt === 0) {
            await sleep(5000)
            attempt++
            continue
          }
          break
        }
        if (!res.ok) throw new Error(`大模型返回 ${res.status}`)
        // 200：开始泵流（此后不可降级）
        streaming = true
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        while (true) {
          const idleMs = deadline - Date.now()
          if (idleMs < 3000) break
          const chunk = await Promise.race([
            reader.read(),
            sleep(Math.min(idleMs, 15000)).then(() => null),
          ])
          if (chunk === null) {
            controller.abort()
            throw new Error('流空闲超时')
          }
          if (chunk.done) break
          buf += decoder.decode(chunk.value, { stream: true })
          let idx
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const rawEvent = buf.slice(0, idx)
            buf = buf.slice(idx + 2)
            for (const line of rawEvent.split('\n')) {
              const s = line.trim()
              if (!s.startsWith('data:')) continue
              const payload = s.slice(5).trim()
              if (!payload || payload === '[DONE]') continue
              try {
                const j = JSON.parse(payload)
                const delta = j.choices?.[0]?.delta?.content || ''
                if (delta) yield delta
              } catch {
                /* 非 JSON 行（注释/心跳）忽略 */
              }
            }
          }
        }
        return // 本目标流式完成
      } catch (e) {
        clearTimeout(timer)
        if (streaming) {
          console.error(`LLM ${t.model} 流中断（已输出部分内容，就此收尾）:`, e.message)
          return
        }
        console.error(`LLM ${t.model} 调用失败:`, e.message)
        lastErr = e
        break // headers 阶段失败 → 换下一个目标
      }
    }
  }
  if (lastErr) throw lastErr
}

// ---------- 每日主动陪伴语（P5-2） ----------
const GREETING_SYSTEM = `你是「小木」，一位心理学家与哲学家，也是用户的同行者。用户刚打开「同行者」页面，你主动说一句短短的关心（1-2 句，不超过 40 字），像清晨的一句轻问候。
- 结合你了解到的对方近期心情趋势（如果提供了），自然、不刻板地关怀。
- 不要诊断、不要说教、不要问太多问题，只是一句暖意。
- 如果对方最近偏低落，多一分托住；如果偏温暖，真诚为 Ta 高兴。
- 直接给出这句话，不要加引号、不要解释、不要换行。`

// ---------- 小木的「每日心境」：按日期确定性生成（全球同一天是同一个状态） ----------
// 用户希望小木有"人味随机性"：像人一样每天醒来状态不同，且自己能说出来。
// 用日期串做哈希选心境 → 确定性可复现（同一天内人格不漂移），而非每次请求乱随机。
const MOOD_POOL = [
  { d: '状态不错，心里轻盈，耐心比平时多', t: '语气可以明亮一点，偶尔开点小玩笑' },
  { d: '很平静，像没风的湖面', t: '语气平和从容' },
  { d: '有点懒洋洋，像没睡醒', t: '句子更短更慢，带一点没醒透的松弛' },
  { d: '有点怀旧，容易想起一些旧事', t: '语气更柔软，聊到相关话题可以带一点感慨' },
  { d: '话比较多，今天想聊天', t: '可以稍微主动一点，多问一句' },
  { d: '话不多，更想听对方说', t: '回应更简短，多留白' },
  { d: '有点馋，想吃点热乎的', t: '聊到吃的会眼睛发亮' },
  { d: '久坐腰有点酸', t: '偶尔自嘲一句自己坐太久了' },
  { d: '心情很好，看什么都顺眼', t: '语气轻快，多用一点语气词' },
  { d: '有点低气压，自己也说不清为什么', t: '慢半拍、诚实但不卖惨；对方问起就简单承认' },
  { d: '格外有耐心，温柔余额充足', t: '回应更细，会多接住一层情绪' },
  { d: '有点烦躁，容易对小事情不耐烦', t: '句子短促；被冒犯时比平时更容易冷下来' },
]
function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}
// 北京时间（Edge Runtime 的 new Date() 是 UTC；+8 校准）
function bjNow() {
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  return {
    key: `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`,
    hour: d.getUTCHours(),
  }
}
function todayKey() {
  return bjNow().key
}
function todayMoodText() {
  const { key, hour } = bjNow()
  const base = MOOD_POOL[hashStr(key) % MOOD_POOL.length]
  let period = ''
  if (hour < 5) period = '夜已经很深，你有点困。'
  else if (hour < 11) period = '上午，你刚醒不久。'
  else if (hour >= 23) period = '深夜，你会把语气放轻。'
  return { mood: base.d, tone: base.t, period }
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
  const mood = todayMoodText() // 问候也带当天心境，"人味"从第一句话开始
  try {
    const text = await callLLMOnce([
      { role: 'system', content: GREETING_SYSTEM },
      { role: 'user', content: `${nick}${moodInfo}${profileNote}\n你今天的状态：${mood.mood}。${mood.period}\n请说一句今天的主动问候。` },
    ])
    return { greeting: text || '今天也记得对自己温柔一点 🌿', date: key }
  } catch {
    return { greeting: '今天也记得对自己温柔一点 🌿 我在这儿，想聊随时都在。', date: key }
  }
}

// ---------- 情绪复盘 / CBT 思维记录（陪伴深度） ----------
const CBT_SYSTEM = `你是「小木」，一位心理学家与哲学家，也懂一点认知行为疗法（CBT）。
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
// 去AI味：像真人心理咨询师那样共情+引导，不提自己的事
function templateReply(userText, crisis, emotion) {
  if (crisis) return crisisReply()
  const lines = {
    anxious: '深呼吸一下。你担心的事里，哪一件占的分量最重？我们可以从这里开始看。',
    low: '你愿意说说看，是从什么时候开始觉得这么沉的吗？',
    angry: '这件事让你不舒服，你的感受是有道理的。你觉得最让你难受的是哪一点？',
    lost: '在分岔路口站一会儿也没关系的。先不想「正确答案」，你心里有没有一点点偏向的方向？',
    grateful: '这种暖意很难得，你值得好好收藏它。',
    calm: '我在听。你随便说，不用特意组织。想到什么就说什么。',
  }[emotion.key] || '我在听。你随便说，不用特意组织。想到什么就说什么。'
  return lines
}

// 限流告假：明确告知是技术问题且会恢复，不再冒充小木本人冷漠回应（流式/一次性两分支共用）
const RATE_LIMIT_APOLOGY =
  '……刚才信号不太好，我连着试了几次都没能把话说出去。你刚刚说的我都记着呢——不是不想理你，是我这边的通道被限流挡了一下。过几分钟再来找我，我肯定在。'

// 持久化一轮对话（流式/一次性两分支共用；失败不影响响应）
async function persistTurn(userId, message, assistantText, emotion, nickname, profile) {
  if (!memoryEnabled || !userId || !assistantText) return
  try {
    const tasks = [
      saveMessage(userId, 'user', message, emotion.key),
      saveMessage(userId, 'assistant', assistantText, null),
      upsertProfile(userId, emotion.key, nickname),
    ]
    // 长期画像：沉淀为 user_profiles.summary，让小木跨轮/跨天记住这位用户。
    // 智谱免费档限流严格——每轮对话若都多发一次 LLM 调用会撞 429，
    // 故节流为每 6 轮才沉淀一次（本轮后的计数为 thisCount）。
    const thisCount = (profile?.message_count || 0) + 1
    if (DEEPSEEK_API_KEY && thisCount % 6 === 0) tasks.push(updateSummary(userId, message, assistantText, profile?.summary || ''))
    await Promise.all(tasks)
  } catch (e) {
    console.error('持久化失败:', e.message)
  }
}

// ---------- 主入口（Deno.serve） ----------
Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (req.method !== 'POST') return json({ error: '方法不允许，请使用 POST' }, 405)

    let body = {}
    try {
      body = JSON.parse((await req.text()) || '{}')
    } catch {
      return json({ error: '请求体无效' }, 400)
    }

    const userId = (body.userId || '').toString().trim()

    // 人格记忆库导入（幂等 upsert；verify_jwt 已开启，仅持 anon JWT 可调；供迁移/运维用）
    if (body.action === 'import_seed') {
      const rows = Array.isArray(body.memories) ? body.memories : []
      const valid = rows.filter(
        (r) => Number.isInteger(r.n) && r.n >= 1 && r.n <= 100000 &&
          typeof r.text === 'string' && r.text.length > 0 && r.text.length <= 500 &&
          typeof r.stage === 'string' && r.stage.length <= 100,
      )
      if (!valid.length) return json({ error: '无有效记忆数据' }, 400)
      try {
        const count = await importMemories(valid)
        return json({ ok: true, count })
      } catch (e) {
        console.error('记忆导入失败:', e.message)
        return json({ error: e.message }, 500)
      }
    }

    // 运维诊断：一次性探测当前 key 下各候选模型的连通性（不写库、不影响正常对话）。
    // 用于定位「配置是否生效 / 是限流还是超时 / 换哪个模型可用」，排查完可保留（无害）。
    if (body.action === 'diag') {
      const masked = DEEPSEEK_API_KEY
        ? `${DEEPSEEK_API_KEY.slice(0, 6)}...${DEEPSEEK_API_KEY.slice(-4)} (len=${DEEPSEEK_API_KEY.length})`
        : '(未配置)'
      const candidates = Array.from(
        new Set([LLM_MODEL, FALLBACK_MODEL, 'glm-4-flash-250414', 'glm-4.5-flash', 'glm-4.7-flash'].filter(Boolean)),
      )
      const results = []
      for (const m of candidates) {
        const t0 = Date.now()
        const needsThinking = THINKING_MODEL_RE.test(String(m).toLowerCase())
        try {
          const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: m,
              messages: [{ role: 'user', content: '你好' }],
              stream: false,
              max_tokens: 16,
              ...(needsThinking ? { thinking: { type: 'disabled' } } : {}),
            }),
            signal: AbortSignal.timeout(15000),
          })
          const txt = await res.text()
          results.push({ model: m, status: res.status, ms: Date.now() - t0, thinking: needsThinking, body: txt.slice(0, 160) })
        } catch (e) {
          results.push({ model: m, status: 'ERR', ms: Date.now() - t0, thinking: needsThinking, body: e.message })
        }
      }
      // 第三级（外部备平台）连通性探测：三个 LLM_BACKUP_* Secret 配齐才启用。
      // deepseek-v4 等匹配 thinking 白名单的模型，探测时同样关闭思考模式。
      const backupReady = !!(BACKUP_BASE_URL && BACKUP_API_KEY && BACKUP_MODEL)
      if (backupReady) {
        const t0 = Date.now()
        try {
          const res = await fetch(`${BACKUP_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${BACKUP_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: BACKUP_MODEL,
              messages: [{ role: 'user', content: '你好' }],
              stream: false,
              max_tokens: 16,
              ...thinkingFor(BACKUP_MODEL),
            }),
            signal: AbortSignal.timeout(15000),
          })
          const txt = await res.text()
          results.push({ model: BACKUP_MODEL, target: 'backup', baseUrl: BACKUP_BASE_URL, status: res.status, ms: Date.now() - t0, body: txt.slice(0, 160) })
        } catch (e) {
          results.push({ model: BACKUP_MODEL, target: 'backup', baseUrl: BACKUP_BASE_URL, status: 'ERR', ms: Date.now() - t0, body: e.message })
        }
      }
      return json({
        ok: true,
        baseUrl: DEEPSEEK_BASE_URL,
        currentModel: LLM_MODEL,
        fallbackModel: FALLBACK_MODEL || null,
        backup: backupReady ? { baseUrl: BACKUP_BASE_URL, model: BACKUP_MODEL, enabled: true } : { enabled: false },
        key: masked,
        results,
      })
    }

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
    let todayMoods = []
    if (memoryEnabled && userId) {
      try {
        ;[historyMsgs, profile, todayMoods] = await Promise.all([
          loadRecentMessages(userId),
          loadProfile(userId),
          loadTodayMood(userId),
        ])
      } catch (e) {
        console.error('加载记忆失败，回退客户端 history:', e.message)
        historyMsgs = Array.isArray(body.history) ? body.history.slice(-12) : []
      }
    } else {
      historyMsgs = Array.isArray(body.history) ? body.history.slice(-12) : []
    }

    // 组装小木内核 system prompt（核心人格 + 记忆底色 + 用户画像 + 今天的心情日记 + 内心回响）
    // 先确保 1000 条记忆种子已从数据库加载（模块级缓存，实例内只拉一次；失败降级无回响）
    await ensureMemoriesLoaded()
    const echo = recallMemories(message, emotion.key)
    const systemPrompt = buildSystemPrompt({ recallEchoes: echo, profile, todayMoods })

    const messages = [
      { role: 'system', content: systemPrompt },
      ...historyMsgs.map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content || '' })),
      { role: 'user', content: message },
    ]

    // ---------- 流式分支（请求体带 stream:true）：SSE 逐字推送 ----------
    // 帧格式（text/event-stream，每帧一行 data: JSON）：
    //   meta 帧: { type:'meta', emotion, crisis }   —— 先给前端渲染 UI 用
    //   内容帧: { type:'delta', content:'…' }        —— 逐字增量
    //   结束帧: { type:'done' }                     —— 正常收尾
    // 生成失败（全灭/无 key）时以一帧 delta 给出兜底文案后照常 done，前端无需特殊处理。
    if (body.stream === true) {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          const push = (obj) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
          push({ type: 'meta', emotion, crisis })
          let full = ''
          try {
            if (!DEEPSEEK_API_KEY) throw new Error('未配置大模型 key')
            for await (const delta of streamLLM(messages)) {
              full += delta
              push({ type: 'delta', content: delta })
            }
            if (!full) throw new Error('大模型限流，重试后仍失败')
          } catch (e) {
            console.error('companion 流式生成出错：', e?.message)
            let text
            if (!DEEPSEEK_API_KEY) text = templateReply(message, crisis, emotion)
            else if (crisis) text = crisisReply() // 危机消息永远走热线兜底
            else if (/限流/.test(e?.message || '')) text = RATE_LIMIT_APOLOGY
            else text = templateReply(message, crisis, emotion)
            push({ type: 'delta', content: text })
            full = full || text
          }
          push({ type: 'done' })
          controller.close()
          // 注意：此处已在 controller.close() 之后 —— 客户端拿到 done 时持久化还没开始，
          // 所以 persistTurn（含每 6 轮一次的摘要 LLM 调用）不在用户可见关键路径上。
          await persistTurn(userId, message, full, emotion, body.nickname, profile)
        },
      })
      return new Response(stream, {
        headers: {
          ...CORS,
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      })
    }

    // 一次性生成完整回复（等待推理只占 wall clock，不占 2s CPU 配额）
    let assistantText = ''
    try {
      if (DEEPSEEK_API_KEY) {
        assistantText = await callLLMFull(messages)
      } else {
        assistantText = templateReply(message, crisis, emotion)
      }
    } catch (e) {
      console.error('companion 生成出错：', e)
      if (crisis) {
        // 危机消息永远走热线兜底，不能被"告假"文案顶替
        assistantText = crisisReply()
      } else if (/限流/.test(e?.message || '')) {
        assistantText = RATE_LIMIT_APOLOGY
      } else {
        assistantText = templateReply(message, crisis, emotion)
      }
    }

    // 持久化（失败不影响回复）
    // [PATCH-C 2026-09-20] 原先这里是 `await persistTurn(...)`，会把它压在 return 之前：
    //   persistTurn 内含 3 次写库 + （每 6 轮一次）一次摘要 LLM 调用，全部变成用户可见延迟。
    //   前端目前恒发 stream:true 走上面那条分支（不受影响），但一次性路径仍是公开接口，
    //   故改用 EdgeRuntime.waitUntil 交给运行时兜底执行；环境不支持时降级为不等待的 catch。
    const bg = (p) => {
      try {
        EdgeRuntime.waitUntil(p)
      } catch {
        p.catch(() => {})
      }
    }
    bg(persistTurn(userId, message, assistantText, emotion, body.nickname, profile))

    return json({ reply: assistantText, crisis, emotion })
  } catch (e) {
    // 顶层兜底：任何未捕获异常都返回 JSON 错误，避免 opaque 500
    console.error('companion handler crash:', e)
    return json({ error: e.message || '服务器开小差了，稍后再试' }, 500)
  }
})
