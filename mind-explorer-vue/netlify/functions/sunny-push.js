// Netlify Function: sunny-push.js
// 心灵晴天「每日自动推送」后端函数 —— 防冷场机制
//
// 触发方式：
//   1. 定时任务：GitHub Actions 每日 08:00（北京时间）POST 调用已部署站点
//   2. 前端兜底懒触发：用户每日首次打开「心灵晴天」时，若今日尚无自动推送则 POST 调用
//
// 数据流向：
//   外部图源（Dog CEO / Cataas / Picsum，均无需 Key）
//     + 内置文案/语录模板池（可选接入 DeepSeek 大模型增强）
//     -> 组装为 type='auto' / 'xiaomu' 的 Post
//     -> 写入 Supabase community_posts 表（需先执行 sql/community_posts_push_columns.sql 补充列）
//
// 幂等：同一天（北京时间）只会成功推送一次，重复调用返回 skipped。可传 { force: true } 强制重推（调试用）。
//
// 所需环境变量（均在 Netlify / GitHub Secrets 中配置，不写死在仓库）：
//   SUPABASE_URL                  Supabase 项目地址
//   SUPABASE_SERVICE_ROLE_KEY     服务端写入密钥（优先，绕过 RLS）；缺省回退 SUPABASE_ANON_KEY
//   SUPABASE_ANON_KEY             publishable key（前端公开 key，作为回退）
//   DEEPSEEK_API_KEY              [可选] 大模型 key，设置后用于生成善意文案与小木语录，失败自动降级模板
//   DEEPSEEK_BASE_URL             [可选] 大模型兼容 OpenAI 的 base url，默认 DeepSeek 官方

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bbdfeiceezcbcbsbnznr.supabase.co'
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_cQdWdavPKrSJZw_GuNByyg_Eb9_v5vg'
const TABLE = 'community_posts'

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ''
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'

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

// 北京时间（UTC+8）今日 00:00 对应的 ISO 字符串，用于按「天」做幂等判断
function todayStartBeijingISO() {
  const now = new Date()
  const beijing = new Date(now.getTime() + 8 * 3600 * 1000)
  beijing.setUTCHours(0, 0, 0, 0)
  return new Date(beijing.getTime() - 8 * 3600 * 1000).toISOString()
}

const rand = (n) => Math.floor(Math.random() * n)
const pick = (arr) => arr[rand(arr.length)]
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---------- 外部图源（均无需 Key） ----------
async function fetchDogImage() {
  try {
    const r = await fetch('https://dog.ceo/api/breeds/image/random', { signal: AbortSignal.timeout(8000) })
    const d = await r.json()
    return d.status === 'success' ? d.message : null
  } catch {
    return null
  }
}
function fetchCatImage() {
  // Cataas 直接返回图片，加随机参数避免每次加载同一张
  return `https://cataas.com/cat?t=${Date.now()}-${rand(1e6)}`
}
function fetchNatureImage(seed) {
  return `https://picsum.photos/seed/${seed}/600/400`
}

// ---------- 文案 / 语录模板池（无 AI key 时的兜底） ----------
const KINDNESS_POSTS = [
  { title: '地铁上有人让座', content: '一位阿姨主动把座位让给提重物的小伙子，两人都笑了。原来温柔这么简单。' },
  { title: '便利店的小纸条', content: '店员在收银台贴了张便签：「今天也要好好吃饭呀」。被这句话暖到了。' },
  { title: '雨中共享的伞', content: '没带伞的我，被陌生邻居一路送到地铁口。她说「顺路」，其实绕了远。' },
  { title: '深夜的灯', content: '加完班回家，家里留了一盏玄关的灯。有人等你，本身就是一种善意。' },
  { title: '递过来的一杯水', content: '排队时前面的人回头问我要不要喝水，把自己多买的那瓶递了过来。' },
  { title: '扶起倒下的单车', content: '路过看到一排被风吹倒的共享单车，有人默默一辆辆扶起来。世界好温柔。' },
  { title: '替我收起的快递', content: '出差回来，邻居把放在门口的快递妥妥收进了屋里，还留了张字条。' },
  { title: '一句「辛苦了」', content: '外卖小哥送餐时说「辛苦了」，我愣了一下，然后也回了句辛苦了。' },
  { title: '让行的司机', content: '路口遛狗的老人慢吞吞，车主没按喇叭，只是笑着等。' },
  { title: '借出的充电器', content: '在咖啡馆手机没电，邻座陌生人把充电器推了过来：「先用我的」。' },
]

const XIAOMU_QUOTES = [
  '你不必时刻坚强。允许自己偶尔像猫一样，懒洋洋地、只是存在着，也很好。',
  '难过不是故障，是心在提醒你：有些东西，你很在意。',
  '把今天过成一杯温水就好——不烫嘴，也不凉心。',
  '别人的节奏再快，也不该成为你焦虑的理由。你有自己的时区。',
  '你已经做得够多了。剩下的，交给今晚的睡眠。',
  '情绪像天气，会来也会走。你不需要赶走乌云，只需记得它总会散。',
  '真正温柔的人，先学会了对自己温柔。',
  '如果今天只能做成一件事，那就好好吃顿饭吧。',
  '你不需要向谁证明值得被爱，你本来就值得。',
  '慢一点没关系的。花不会因为开得晚，就少一点香气。',
]

const CAT_TITLES = ['今天遇到的猫', '路边的橘猫', '窗台上的猫', '晒着太阳的猫', '正在发呆的猫']
const DOG_TITLES = ['今天遇到的狗', '摇尾巴的伙伴', '路边的修勾', '想摸一下的狗', '等主人的狗']
const NATURE_TITLES = ['雨后的天空', '路边的花', '傍晚的光', '安静的湖面', '清晨的树']

const CAT_CONTENT = '它慢悠悠地瞥了你一眼，好像在说：别急，日子还长。'
const DOG_CONTENT = '它摇着尾巴跑过来，纯粹地、毫无保留地，把开心给了你。'
const NATURE_CONTENT = '抬头看了一会儿，整颗心好像也被风吹软了。'

// ---------- 可选：大模型生成（失败自动降级模板） ----------
async function aiChat(system, user, expectJson = false) {
  const r = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.9,
      response_format: expectJson ? { type: 'json_object' } : undefined,
    }),
  })
  if (!r.ok) throw new Error(`AI ${r.status}`)
  const d = await r.json()
  return d.choices?.[0]?.message?.content || ''
}

async function generateKindness(n) {
  if (!DEEPSEEK_API_KEY) return shuffle(KINDNESS_POSTS).slice(0, n)
  try {
    const text = await aiChat(
      '你是温暖内容编辑，为中文心理疗愈社区「心灵晴天」写「善意行为」短帖。要求：真实、克制、不煽情，每条 1-2 句。',
      `生成 ${n} 条互不重复的善意行为小故事，返回 JSON：{"items":[{"title":"标题","content":"内容"}]}`,
      true
    )
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    const items = parsed.items || []
    if (items.length) return items.slice(0, n)
  } catch (e) {
    console.error('AI 生成善意文案失败，降级模板：', e.message)
  }
  return shuffle(KINDNESS_POSTS).slice(0, n)
}

async function generateXiaomuQuote() {
  if (!DEEPSEEK_API_KEY) return pick(XIAOMU_QUOTES)
  try {
    const text = await aiChat(
      '你是「小木」，一位温柔的心理学家与哲学家。语录风格：温柔、有哲学意味、不评判、短小（1-2 句）。',
      '写一句今日语录，给可能疲惫的人一点安抚。只返回这句话，不要解释。'
    )
    if (text && text.trim()) return text.trim().replace(/^["“”]|["“”]$/g, '')
  } catch (e) {
    console.error('AI 生成小木语录失败，降级模板：', e.message)
  }
  return pick(XIAOMU_QUOTES)
}

// ---------- 组装 ----------
function autoPost(category, image, title, content, sourceApi) {
  return {
    type: 'auto',
    category,
    image: image || null,
    title,
    content,
    username: '系统推送',
    user_type: 'system',
    source_api: sourceApi || 'system',
    is_auto_push: true,
  }
}

async function buildDailyPosts() {
  const plan = { cat: 3, dog: 3, nature: 2, kindness: 3 }

  const [dogUrls, catUrls, natureUrls] = await Promise.all([
    Promise.all(Array.from({ length: plan.dog }, fetchDogImage)),
    Promise.all(Array.from({ length: plan.cat }, fetchCatImage)),
    Promise.all(Array.from({ length: plan.nature }, () => fetchNatureImage(rand(99999)))),
  ])

  const posts = []
  dogUrls.filter(Boolean).forEach((url, i) =>
    posts.push(autoPost('dog', url, DOG_TITLES[i % DOG_TITLES.length], DOG_CONTENT, 'dog.ceo'))
  )
  catUrls.filter(Boolean).forEach((url, i) =>
    posts.push(autoPost('cat', url, CAT_TITLES[i % CAT_TITLES.length], CAT_CONTENT, 'cataas'))
  )
  natureUrls.filter(Boolean).forEach((url, i) =>
    posts.push(autoPost('nature', url, NATURE_TITLES[i % NATURE_TITLES.length], NATURE_CONTENT, 'picsum'))
  )

  const kindness = await generateKindness(plan.kindness)
  kindness.forEach((k) =>
    posts.push(autoPost('kindness', null, k.title || '今日善意', k.content || '', DEEPSEEK_API_KEY ? 'deepseek' : 'template'))
  )

  const quote = await generateXiaomuQuote()
  posts.push({
    type: 'xiaomu',
    category: 'quote',
    image: null,
    title: '小木的今日语录',
    content: quote,
    username: '小木',
    user_type: 'system',
    source_api: DEEPSEEK_API_KEY ? 'deepseek' : 'template',
    is_auto_push: true,
  })

  return posts
}

// ---------- 幂等 & 写入 ----------
async function alreadyPushedToday() {
  const start = todayStartBeijingISO()
  const url = `${SUPABASE_URL}/rest/v1/${TABLE}?select=id&is_auto_push=eq.true&created_at=gte.${encodeURIComponent(start)}&limit=1`
  try {
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      console.error('检查已推送失败', res.status)
      return false // 查询失败时保守地允许推送（避免误跳过）
    }
    const rows = await res.json()
    return Array.isArray(rows) && rows.length > 0
  } catch (e) {
    console.error('检查已推送异常', e.message)
    return false
  }
}

async function savePosts(posts) {
  if (!posts.length) return 0
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(posts),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`写入 community_posts 失败 ${res.status}: ${txt}`)
  }
  return posts.length
}

// ---------- 主入口 ----------
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return json({ error: '方法不允许，请使用 POST' }, 405)

  try {
    let body = {}
    try {
      body = JSON.parse(event.body || '{}')
    } catch {
      /* 空 body 也允许 */
    }
    const force = !!body.force

    if (!force && (await alreadyPushedToday())) {
      return json({ ok: true, skipped: true, reason: '今天已经推送过啦 ☀️' })
    }

    const posts = await buildDailyPosts()

    // 演练模式：只组装不写入，便于上线前验证图源/文案链路（设 DRY_RUN=1）
    if (process.env.DRY_RUN) {
      console.log('[DRY_RUN] 将推送', posts.length, '条：', posts.map((p) => `${p.type}:${p.category}`).join(', '))
      return json({ ok: true, dryRun: true, count: posts.length, preview: posts.map((p) => ({ type: p.type, category: p.category, title: p.title })) })
    }

    const count = await savePosts(posts)
    return json({ ok: true, pushed: true, count, generatedAt: new Date().toISOString() })
  } catch (e) {
    console.error('sunny-push 执行出错：', e)
    return json({ ok: false, error: e.message || '未知错误' }, 500)
  }
}
