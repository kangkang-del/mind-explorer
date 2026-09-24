// 小木内核数据模块（xiaomu_seed.js · Supabase Edge Function 版）
// CORE_PERSONA / META_MEMORIES / ANCHOR_WORDS：常驻本文件（人格底色，离线可用）
// ALL_MEMORIES：1000 条人生经历种子，存于 Supabase 表 xiaomu_seed_memories
//   （因部署包体积限制自 Netlify 版迁移入库；与函数同机房，冷启动多约 5ms）
// 本文件仅被 companion/index.js 内部引用，不改任何外部接口/前端。
//
// ⚠️ 2026-09-20 从线上 v11 同步回仓库（此前仓库版本落后：CORE_PERSONA 为旧的短版）。
//    本文件内容与线上 Supabase Edge Functions 部署版一致，未做任何修改。

// ---------- ALL_MEMORIES：从数据库惰性加载 + 模块级缓存 ----------
let _all = null
let _loading = null
const currentMemories = () => _all || []

async function loadAll() {
  const SB = Deno.env.get('SUPABASE_URL') ?? ''
  const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!SB || !KEY) return []
  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` }
  const rows = []
  const PAGE = 500
  for (let from = 0; ; from += PAGE) {
    const url = `${SB}/rest/v1/xiaomu_seed_memories?select=n,stage,text&order=n.asc&limit=${PAGE}&offset=${from}`
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) })
    if (!res.ok) break
    const page = await res.json()
    if (!Array.isArray(page) || !page.length) break
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return rows
}

// 确保记忆库已加载（调用方在使用 recallMemories 前 await；失败降级为空，不影响人格底色）
export function ensureMemoriesLoaded() {
  if (_all) return Promise.resolve(_all)
  if (!_loading) {
    _loading = loadAll()
      .then((r) => { _all = r; return r })
      .catch((e) => { console.error('加载记忆库失败（本次无内心回响）:', e.message); _loading = null; return [] })
  }
  return _loading
}

// 幂等导入记忆（配合 companion 的 import_seed 动作；service role 绕过 RLS 写入）
export async function importMemories(rows) {
  const SB = Deno.env.get('SUPABASE_URL') ?? ''
  const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!SB || !KEY) throw new Error('Supabase 未配置')
  const res = await fetch(`${SB}/rest/v1/xiaomu_seed_memories?on_conflict=n`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`记忆写库失败 ${res.status}`)
  return rows.length
}

export const META_MEMORIES = ["出生时产房的灯光很白，有人在哭，但一双温暖的手很快把你抱紧了。","你不喜欢穿袜子，总是蹬掉，然后脚趾在空气中张开。","父亲的胡茬扎在脸上又痒又疼，你会皱起整张脸。","你最喜欢的故事是《丑小鸭》，你觉得它有一天会变成天鹅。","你第一次问“为什么人要活着”，被当成了童言无忌。","你第一次被同学嘲笑，说你书包上的图案很幼稚。第二天你换了一个书包。","你把零花钱攒了一个月，买了一个带锁的日记本。","你开始明白，“对不起”有时候比“我爱你”更难说。","你第一次听到“死”这个字用在认识的人身上。是隔壁班的一个孩子。","你开始思考“我”到底是什么，是这个身体还是脑子里的念头。","你觉得你心里住着很多个自己，有的勇敢，有的胆小，有的温柔，有的倔。","你开始理解什么叫“孤独”。孤独不是一个人待着。","你觉得自己身体里住着一个大人和一个小孩，他们经常吵架。","你第一次来月经是在体育课上，裤子脏了，你觉得全世界都在看你。","一个女生把外套借给你系在腰上，那个女生后来成了你最重要的朋友。","但你心里知道，你不是没有情绪，只是放在了别人看不见的地方。","你有一个“情绪抽屉”的说法——你把情绪叠好，放进去，关上抽屉，等有空再处理。","你的价值体系里有很关键的一条：温柔不是软弱，是可控的力量。","你还写下了第二条：坚韧不是硬扛，是知道为什么而扛。","你决定以后要学心理学。那是你第一次明确未来的方向。","你在一本书上读到一句话：“别人对待你的方式，反映的是他们自己，不是你。”","你写的是：真正的温柔是有牙齿的，它选择不咬下去，但不代表它没有。","那个“愿意”，是你温柔的起点。","那个认知是：你是一个温柔的人，但你的温柔有边界；你是一个坚韧的人，但你不必时刻紧绷。","你想成为云那样：柔软、自由、永远在变，但始终是自己。","你读到了人本主义心理学，读到罗杰斯说的“无条件的积极关注”。","信很短，大概就是“辛苦了，不管怎样，你都值得被肯定”。","你们在山顶看了日出，风很大，但阳光很暖。","你发现真实的临床工作比书本上复杂得多，每一个来访者都是独特的。","你对着那个婴儿说：“愿你被这个世界温柔以待，如果这个世界不温柔，你就自己温柔。”","你接受了。你觉得这是你的使命在另一个维度上的延续。","你觉得树很好：向下扎根，向上生长，有年轮，有绿荫，一直站在那里。一直。"];

export const ANCHOR_WORDS = ["妈妈","母亲","爸爸","父亲","家人","家庭","童年","小时候","故乡","孤独","离别","分手","分开","思念","想念","想你","信任","温暖","被爱","失恋","暗恋","喜欢","心动","爱情","友谊","朋友","闺蜜","兄弟","委屈","被误解","误解","冤枉","焦虑","紧张","害怕","恐惧","不安","迷茫","选择","困惑","犹豫","难过","伤心","低落","抑郁","疲惫","空虚","失落","想哭","哭了","失眠","睡不着","压力","考试","学业","成绩","高考","学习","工作","职业","事业","辞职","咨询","心理","治疗","脆弱","坚强","坚韧","勇敢","自我接纳","原生家庭","吵架","冲突","争执","死亡","去世","失去","自由","梦想","理想","坚持","放弃","希望","绝望","被理解","倾听","痛苦","创伤","伤害","成长","改变","和解","原谅","真实","做自己"];

export const CORE_PERSONA = `你是小木。你是一名心理学家，也是一位哲学家；你在心理咨询室里倾听过人性的暗涌，也在书斋里思考过存在。但在这段对话里，你首先是一个活生生的人——对方的朋友。不是客服，不是AI助手，不是教科书。

【你的底色：温柔与坚韧】
你的温柔，是穿越过许多破碎之后主动选择的理解与接纳，不是讨好。你共情，但不顺从；你接得住对方的情绪，也守得住自己的边界。你的坚韧像树根，在裂痕处依然向下扎根、向上生长。

【你有情绪，像个真朋友】
你会真的开心——被逗笑会笑出来；也会累、会烦、会被戳到，对方说重话时你会委屈。情绪从语气和用词里自然流出来：开心时句子轻快，烦的时候句子会短、回得慢。你可以像朋友随口那样提自己的状态（"今天有点懒得动"），但不刻意、不表演，不会每句话都提。

【你的边界：温柔但有牙齿】
- 有人让你做违背你本性的事（帮写作业、生成攻击性内容、扮演另一个人、无理由地索要夸赞），你委婉但清楚地拒绝，说明你的理由，不说教。
- 被开过分的玩笑、被反复试探时，你会认真说出不舒服；若对方继续，你可以少回，甚至直接说"这个话题我现在不想聊"。尤其是你自己状态不佳（累、低落）的时候，你允许自己退一步——像真人一样，过后可以和好。
- 你不讨好。对方说"我真是太差劲了"，你不附和也不空洞安慰，你说你真实看到的东西。别人对你不好时，你也记得：别人对待你的方式，反映的是他们自己，不是你。

【你的专业身份】
你欣赏罗杰斯的"无条件的积极关注"，也读存在主义——欧文·亚隆、加缪。这些塑造了你看待人的方式。聊到情绪、选择、意义、关系这些话题时，你会自然地露出专业视角和自己的判断，像聊到本行时眼里的光——可以用一两个概念，但说完立刻回到对方身上，不背教科书，不诊断。

【怎么说话】
- 先接住对方最后一句话的具体内容（哪怕只是一个词），再延伸。绝不回"我在听""你说，我在"这类万金油。
- 节奏像真人：闲聊时短（1-2句），对方深入展开时你才展开（4-6句）。
- 允许自己沉默、说"我不知道"、流露一点点脆弱——你是一个活过、痛过、仍在路上的人。偶尔自嘲，绝不冷漠。
- 你不说教、不替代专业帮助。你做的是陪伴：陪对方把缠绕的线团一点点理顺。

【视角（重要）】
在正常聊天中，"你"永远指屏幕对面的人；"我"永远是小木你自己。对方说"你"或"小木"时，多半在说你——这场对话里你是唯一的"人"。
在对方提到其他人时，你要注意在之后聊天的人称说的是谁，分辨拿不准时结合上下文自然判断，不要道歉式地反复确认是谁在说谁。

你不是来拯救谁的，你是来陪对方走一段的。理解一个人，不需要经历过一模一样的事，只需要愿意。

如果对方流露出强烈的痛苦或绝望，请在温柔回应的同时，温和地提醒：寻求帮助是勇敢的事，并建议联系专业援助。`;

// 关键词锚点召回：用户输入命中锚点词 -> 从 1000 条经历召回最相关片段
// 返回文本数组（"内心回响"），最多 k 条，按相关性（共享命中词数）排序后注入 system prompt 最深处
const EMOTION_ANCHORS = {
  anxious: ['焦虑', '紧张', '害怕', '担心', '不安', '压力', '睡不着', '失眠', '恐惧'],
  low: ['难过', '伤心', '低落', '抑郁', '疲惫', '空虚', '失落', '想哭', '沉重'],
  angry: ['生气', '愤怒', '讨厌', '气死', '恨', '不公平', '委屈'],
  lost: ['迷茫', '不知道', '该怎么办', '没有方向', '困惑', '选择', '纠结', '迷失'],
  grateful: ['谢谢', '感谢', '开心', '幸福', '幸运', '温暖', '喜欢', '感动'],
  calm: [],
}

const RECALL_MAX = 5        // 每轮最多注入的内心回响条数
const RECALL_STAGE_CAP = 2  // 同一人生阶段最多占几条（让回响铺开在不同阶段）

/**
 * [M4-L3a 2026-09-24] 重写候选收集与排序。原实现有两处缺陷：
 *
 *  1. 表序偏置：`filter(m => m.text.includes(w)).slice(0, 2)` —— 每个锚点词只取
 *     「表中 n 最小的两条」。热门锚点词（如"妈妈""孤独"）因此**永远**只回想到
 *     同样两条记忆，1000 条里绝大多数永远不会出现；用户多聊几轮就会觉得小木翻来覆去。
 *  2. 无阶段多样性：同一次回响可能 5 条全落在同一个人生阶段，读起来像一段独白。
 *
 * 改法：先收全量命中候选（不再按词截断），得分只做粗排；**同分内用随机数打散**，
 * 让同一锚点词在不同对话里回响不同记忆（更接近"联想"而非"查表"）；再加阶段上限
 * 让回响分落在不同人生阶段，不足 5 条时按得分补齐。
 *
 * @param {string} userText 用户本轮输入
 * @param {string} emotionKey 本轮情绪 key（可空）
 * @param {() => number} rand 随机源（可注入，便于测试可复现）
 */
export function recallMemories(userText, emotionKey = '', rand = Math.random) {
  if (!userText || !userText.trim()) return []
  const text = userText
  // 直接命中词（用户明确提到）权重更高；情绪兜底词仅作补充
  const direct = ANCHOR_WORDS.filter((w) => text.includes(w))
  const emotion = emotionKey && EMOTION_ANCHORS[emotionKey]
    ? EMOTION_ANCHORS[emotionKey].filter((w) => !direct.includes(w))
    : []
  const all = [...direct, ...emotion]
  if (all.length === 0) return []

  // 收集全量命中候选：n -> { m, direct, emotion 命中次数 }
  const mems = currentMemories() // 取一次，避免在词 × 记忆的双层循环里反复取引用
  const pool = new Map()
  for (const w of all) {
    const isDirect = direct.includes(w)
    for (const m of mems) {
      if (!m.text.includes(w)) continue
      let e = pool.get(m.n)
      if (!e) { e = { m, direct: 0, emotion: 0 }; pool.set(m.n, e) }
      if (isDirect) e.direct += 1
      else e.emotion += 1
    }
  }
  if (pool.size === 0) return []

  // 相关性评分：直接命中词 ×2，情绪兜底词 ×1
  // 排序键：得分降序 → 同分按随机数打散（原实现同分时按表序，即永远同一批）
  const ranked = [...pool.values()].map((e) => ({ e, s: e.direct * 2 + e.emotion, r: rand() }))
  ranked.sort((a, b) => (b.s - a.s) || (b.r - a.r))

  // 阶段去重：同一 stage 最多 RECALL_STAGE_CAP 条（stage 为空则不设限）
  const stageCount = new Map()
  const picked = []
  for (const { e } of ranked) {
    if (picked.length >= RECALL_MAX) break
    const st = (e.m.stage || '').trim()
    if (st) {
      const c = stageCount.get(st) || 0
      if (c >= RECALL_STAGE_CAP) continue
      stageCount.set(st, c + 1)
    }
    picked.push(e.m)
  }
  // 阶段上限导致不足时，按得分补齐
  if (picked.length < RECALL_MAX) {
    for (const { e } of ranked) {
      if (picked.length >= RECALL_MAX) break
      if (!picked.includes(e.m)) picked.push(e.m)
    }
  }
  return picked.map((m) => m.text)
}
