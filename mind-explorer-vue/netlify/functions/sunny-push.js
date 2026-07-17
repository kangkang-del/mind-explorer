// Netlify Function: sunny-push.js
// 心灵晴天「每日自动推送」后端函数 —— 防冷场机制
//
// 触发方式：
//   1. 定时任务：GitHub Actions 每日 08:00（北京时间）POST 调用已部署站点
//   2. 前端兜底懒触发：用户每日首次打开「心灵晴天」时，若今日尚无自动推送则 POST 调用
//
// 数据流向：
//   外部图源（Dog CEO / Cataas / Picsum，均无需 Key）
//     + 内置文案/语录模板池（配 DEEPSEEK_API_KEY 后由大模型生成善意文案、小木语录、图片配文）
//     + 每日一卡（复用 cards.json 心理卡片资产，自包含嵌入 DAILY_CARDS）
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

// ---------- 每日一卡（复用 cards.json 资产，自包含，无需前端资源） ----------
// 字段：t=标题, s=摘要(纯文本，直接作推送文案), cat=原分类
const DAILY_CARDS = [{"id":1,"t":"锚定效应 (Anchoring Effect)","s":"做判断时过度依赖最先获得的信息（锚点），即使该信息与当前决策无关。","cat":"认知偏差"},{"id":2,"t":"确认偏误 (Confirmation Bias)","s":"倾向于寻找、解释和记忆能证实自己已有信念的信息，同时忽略相反的证据。","cat":"认知偏差"},{"id":3,"t":"可得性启发 (Availability Heuristic)","s":"人们倾向于根据某事件在脑海中浮现的容易程度来判断其发生概率。","cat":"认知偏差"},{"id":4,"t":"框架效应 (Framing Effect)","s":"同一问题的不同表述方式（框架）会显著影响人们的选择和判断。","cat":"认知偏差"},{"id":5,"t":"沉没成本谬误 (Sunk Cost Fallacy)","s":"因为已经投入了不可收回的成本，而继续坚持一个不利的选择。","cat":"认知偏差"},{"id":6,"t":"损失规避 (Loss Aversion)","s":"人们对损失的感受强度约为同等收益的2-2.5倍。失去100元的痛苦大于得到100元的快乐。","cat":"认知偏差"},{"id":7,"t":"禀赋效应 (Endowment Effect)","s":"一旦拥有某物品，对其价值的评价会显著高于拥有之前。","cat":"认知偏差"},{"id":8,"t":"当下偏差 (Present Bias)","s":"倾向于高估即时回报、低估未来回报，导致拖延和冲动决策。","cat":"认知偏差"},{"id":9,"t":"赌徒谬误 (Gambler's Fallacy)","s":"错误地认为独立随机事件之间存在关联，认为连续发生的事件下次概率会改变。","cat":"认知偏差"},{"id":10,"t":"基本比率谬误 (Base Rate Fallacy)","s":"在判断概率时过度关注具体个案信息，而忽略或低估基本比率（先验概率）。","cat":"认知偏差"},{"id":11,"t":"达克效应 (Dunning-Kruger Effect)","s":"能力不足的人无法认识到自己的不足，反而高估自己的能力。真正的专家则倾向于低估自己。","cat":"认知偏差"},{"id":12,"t":"基本归因谬误 (Fundamental Attribution Error)","s":"解释他人行为时过度归因于内在特质，而低估情境因素的影响。","cat":"认知偏差"},{"id":13,"t":"盲点偏见 (Bias Blind Spot)","s":"认为别人有偏见，但自己没有。人们更容易识别他人的认知偏差而非自己的。","cat":"认知偏差"},{"id":14,"t":"乐观偏差 (Optimism Bias)","s":"高估自己经历积极事件的可能性，低估经历消极事件的可能性。","cat":"认知偏差"},{"id":15,"t":"从众效应 (Bandwagon Effect)","s":"因为很多人相信或做某件事，自己也倾向于相信或做这件事。","cat":"认知偏差"},{"id":16,"t":"权威偏见 (Authority Bias)","s":"倾向于认为权威人士的意见更准确、更可信，即使在其专业领域之外。","cat":"认知偏差"},{"id":17,"t":"群内偏差 (Ingroup Bias)","s":"倾向于偏爱自己所属的群体及其成员，对外群体持更负面的态度。","cat":"认知偏差"},{"id":18,"t":"晕轮效应 (Halo Effect)","s":"对某人或某物的一个正面特质产生好感后，这种好感会「晕染」到对其整体的评价。","cat":"认知偏差"},{"id":19,"t":"巴纳姆效应 (Barnum Effect)","s":"人们倾向于认为模糊、普遍的人格描述特别适合自己，是星座和性格测试的心理基础。","cat":"认知偏差"},{"id":20,"t":"旁观者效应 (Bystander Effect)","s":"紧急情况下，旁观者越多，每个人提供帮助的可能性越低。","cat":"认知偏差"},{"id":21,"t":"后见之明偏差 (Hindsight Bias)","s":"事件发生后，倾向于认为'我早就知道会这样'，高估自己事前的预测能力。","cat":"认知偏差"},{"id":22,"t":"蔡格尼克效应 (Zeigarnik Effect)","s":"人们对未完成任务的记忆比已完成任务更深刻。未完成的事会在脑海中持续占据空间。","cat":"认知偏差"},{"id":23,"t":"峰终定律 (Peak-End Rule)","s":"人们对一段体验的记忆主要取决于高峰时刻和结束时刻的感受，而非体验的平均值。","cat":"认知偏差"},{"id":24,"t":"宜家效应 (IKEA Effect)","s":"对自己亲手创造或组装的东西赋予不成比例的高价值。","cat":"认知偏差"},{"id":25,"t":"前景理论 (Prospect Theory)","s":"描述人们在风险和不确定性下如何做决策，是行为经济学的基石。由 Kahneman 和 Tversky 提出，获得2002年诺贝尔经济学奖。","cat":"行为经济学"},{"id":26,"t":"心理账户 (Mental Accounting)","s":"人们将金钱划分到不同的'心理账户'中，每个账户有不同的使用规则，导致非理性的消费和投资决策。","cat":"行为经济学"},{"id":27,"t":"助推理论 (Nudge Theory)","s":"通过精心设计选择架构，以非强制的方式引导人们做出更好的决策，同时保留自由选择权。","cat":"行为经济学"},{"id":28,"t":"现状偏见 (Status Quo Bias)","s":"人们倾向于维持现状，即使改变更有利也不愿行动。默认选项有巨大的力量。","cat":"行为经济学"},{"id":29,"t":"双曲贴现 (Hyperbolic Discounting)","s":"人们对即时回报的偏好远大于未来回报，导致时间不一致的决策。","cat":"行为经济学"},{"id":30,"t":"社会规范 (Social Norms)","s":"人们的行为深受他人行为和期望的影响。告知'大多数人做了什么'是强大的行为改变工具。","cat":"行为经济学"},{"id":31,"t":"选择过载 (Choice Overload)","s":"当选项过多时，人们反而更难做出决定，满意度下降，甚至放弃选择。","cat":"行为经济学"},{"id":32,"t":"诱饵效应 (Decoy Effect)","s":"引入一个明显较差的选项（诱饵），可以让目标选项显得更有吸引力。","cat":"行为经济学"},{"id":33,"t":"热手谬误 (Hot Hand Fallacy)","s":"错误地认为连续成功之后更可能继续成功，源于对随机序列的误解。","cat":"行为经济学"},{"id":34,"t":"凡勃仑效应 (Veblen Effect)","s":"商品价格越高，需求反而越大。消费者通过高价商品展示社会地位。","cat":"行为经济学"},{"id":35,"t":"交易效用理论 (Transaction Utility)","s":"消费者的满意度不仅取决于商品本身的价值，还取决于交易的「公平感」——感觉「占了便宜」带来的额外满足。","cat":"行为经济学"},{"id":36,"t":"默认选项效应 (Default Effect)","s":"人们极大概率会接受预设的默认选项，即使改变选项的成本很低。这是助推最有力的工具之一。","cat":"行为经济学"},{"id":37,"t":"斯坦福监狱实验","s":"1971年津巴多将大学生随机分为囚犯和看守，原计划两周的实验仅六天因过激行为终止。证明情境和角色对人的行为有巨大影响。","cat":"经典实验"},{"id":38,"t":"米尔格拉姆服从实验","s":"1961年实验发现65%的参与者愿意在权威指令下对他人施加致命电击。揭示了权威服从的强大力量。","cat":"经典实验"},{"id":39,"t":"棉花糖实验 (延迟满足)","s":"研究儿童延迟满足能力。能等待15分钟获得两颗棉花糖的儿童，多年后在学业和生活中表现更好。","cat":"经典实验"},{"id":40,"t":"阿希从众实验","s":"1951年实验证明，即使明显错误的群体判断也能让个体从众。约75%的人至少从众一次。","cat":"经典实验"},{"id":41,"t":"波波玩偶实验 (社会学习理论)","s":"班杜拉1961年证明儿童会通过观察和模仿习得攻击行为，奠定了社会学习理论的基础。","cat":"经典实验"},{"id":42,"t":"罗森塔尔实验 (皮格马利翁效应)","s":"教师被告知某些学生是'潜力股'（实际随机挑选），结果这些学生成绩真的显著提高。","cat":"经典实验"},{"id":43,"t":"习得性无助实验","s":"动物（和人类）在反复经历无法控制的负面事件后，会学会放弃努力，即使后来可以逃脱。","cat":"经典实验"},{"id":44,"t":"小阿尔伯特实验 (恐惧条件化)","s":"华生1920年证明恐惧可以通过经典条件反射习得和泛化，9个月大的婴儿被条件化害怕白鼠。","cat":"经典实验"},{"id":45,"t":"感觉剥夺实验","s":"1954年实验证明，大脑的正常发育和功能维持需要持续的外界感官刺激。完全剥夺感觉会导致幻觉和认知紊乱。","cat":"经典实验"},{"id":46,"t":"霍桑效应实验","s":"被关注本身就能改变行为。工厂工人因为知道自己被观察而提高生产效率。","cat":"经典实验"},{"id":47,"t":"记忆可靠性实验 (误导信息效应)","s":"Loftus证明记忆可以被事后信息改变甚至植入。提问方式能影响目击证人的记忆。","cat":"经典实验"},{"id":48,"t":"人际吸引增减原则实验","s":"'先否定后肯定'比'一直肯定'更能获得好感。态度的变化方向比态度的绝对值更重要。","cat":"经典实验"},{"id":49,"t":"科尔伯格道德发展实验","s":"通过道德两难故事研究道德推理的发展阶段，提出道德发展的三水平六阶段理论。","cat":"经典实验"},{"id":50,"t":"反馈效应实验","s":"及时反馈比延时反馈更能促进学习。知道结果的学习效率远高于不知道结果。","cat":"经典实验"},{"id":51,"t":"定位速效法实验","s":"目标明确、进度可见可以显著提高完成任务的效率。","cat":"经典实验"},{"id":52,"t":"执行猴实验","s":"心理压力对生理健康有显著影响。需要持续决策和承担责任的猴子出现了严重的胃溃疡。","cat":"经典实验"},{"id":53,"t":"青蛙实验 (温水煮青蛙)","s":"渐进式的变化令人丧失警觉。突然的变化会引起剧烈反应，但缓慢的变化往往被忽视。","cat":"经典实验"},{"id":54,"t":"蔡格尼克效应实验","s":"未完成任务的记忆比已完成任务深刻约2倍。大脑对'未竟之事'有天然的记忆优势。","cat":"经典实验"},{"id":55,"t":"认知心理学","s":"研究人类的认知过程，包括注意、记忆、语言、思维、问题解决和决策等高级心理功能。","cat":"心理学分支"},{"id":56,"t":"社会心理学","s":"研究人们如何受到他人实际、想象或隐含的存在的影响。关注态度、从众、群体行为、偏见等主题。","cat":"心理学分支"},{"id":57,"t":"行为经济学","s":"将心理学洞察融入经济学分析，研究人类在有限理性下的决策行为。","cat":"心理学分支"},{"id":58,"t":"发展心理学","s":"研究人类从出生到老年的心理发展规律，涵盖认知、情感和社会性发展。皮亚杰的认知发展阶段理论是该领域的基石。","cat":"心理学分支"},{"id":59,"t":"临床心理学","s":"关注心理健康问题的评估、诊断和治疗。认知行为疗法（CBT）是循证治疗的主流方法。","cat":"心理学分支"},{"id":60,"t":"人格心理学","s":"研究人格特质、类型、成因及对行为的影响。大五人格模型（OCEAN）是目前最被接受的人格理论框架。","cat":"心理学分支"},{"id":61,"t":"丹尼尔·卡尼曼 (Daniel Kahneman)","s":"2002年诺贝尔经济学奖得主，前景理论创始人，认知偏差研究的奠基人。《思考，快与慢》作者。","cat":"心理学家"},{"id":62,"t":"理查德·塞勒 (Richard Thaler)","s":"2017年诺贝尔经济学奖得主，心理账户和助推理论的创始人，行为经济学的主要推动者。","cat":"心理学家"},{"id":63,"t":"阿莫斯·特沃斯基 (Amos Tversky)","s":"与卡尼曼共同创立前景理论，系统研究启发式与偏差。被认为是行为经济学最重要的奠基人之一。","cat":"心理学家"},{"id":64,"t":"罗伯特·西奥迪尼 (Robert Cialdini)","s":"影响力研究权威，《影响力》作者。提出六大影响力原则：互惠、承诺一致、社会认同、喜好、权威、稀缺。","cat":"心理学家"},{"id":65,"t":"丹·艾瑞里 (Dan Ariely)","s":"《怪诞行为学》作者，研究可预测的非理性行为。擅长用有趣的实验揭示日常决策中的偏差。","cat":"心理学家"},{"id":66,"t":"阿尔伯特·班杜拉 (Albert Bandura)","s":"社会学习理论创始人，自我效能感概念的提出者。波波玩偶实验证明观察学习的力量。","cat":"心理学家"},{"id":67,"t":"情绪智力 (Emotional Intelligence)","s":"识别、理解、管理和运用情绪的能力，比IQ更能预测人生成功与幸福。","cat":"情绪心理学"},{"id":68,"t":"认知失调 (Cognitive Dissonance)","s":"当行为与信念不一致时产生的心理不适，人们会改变态度来消除这种不适。","cat":"社会心理学"},{"id":69,"t":"大五人格 (Big Five Personality)","s":"用五个维度描述人格特质的模型（OCEAN），是人格心理学最可靠的框架。","cat":"人格心理学"},{"id":70,"t":"依恋理论 (Attachment Theory)","s":"婴儿与照护者之间的早期情感纽带，深刻影响一生的人际关系模式。","cat":"发展心理学"},{"id":71,"t":"自我效能感 (Self-Efficacy)","s":"个体对自己能否成功完成某项任务的信念，直接影响行为选择和坚持程度。","cat":"社会心理学"},{"id":72,"t":"心流 (Flow)","s":"全神贯注投入某项活动时的最佳体验状态，时间感消失，行动与意识合一。","cat":"积极心理学"},{"id":73,"t":"心理防御机制 (Defense Mechanisms)","s":"自我为减轻焦虑和冲突而无意识使用的心理策略，从成熟的升华到原始的否认。","cat":"精神分析"},{"id":74,"t":"刻板印象 (Stereotypes)","s":"对某一群体固定化、概括化的信念，简化认知但常导致偏见和歧视。","cat":"社会心理学"},{"id":75,"t":"群体极化 (Group Polarization)","s":"群体讨论后，成员的观点会朝原有倾向的极端方向偏移，使集体决策更激进。","cat":"社会心理学"},{"id":76,"t":"群体思维 (Groupthink)","s":"高凝聚力群体为追求一致而压制异议，导致决策质量下降的现象。","cat":"社会心理学"},{"id":77,"t":"艾宾浩斯遗忘曲线 (Ebbinghaus Forgetting Curve)","s":"记忆随时间推移而衰退的规律：学习后遗忘立即开始，初期最快，之后渐缓。","cat":"认知心理学"},{"id":78,"t":"经典条件反射 (Classical Conditioning)","s":"中性刺激与无条件刺激反复配对后，中性刺激单独也能引发条件反应。","cat":"行为主义"},{"id":79,"t":"操作性条件反射 (Operant Conditioning)","s":"通过强化和惩罚来塑造行为：被强化的行为会增加，被惩罚的行为会减少。","cat":"行为主义"},{"id":80,"t":"社会交换理论 (Social Exchange Theory)","s":"人际关系基于成本-收益的理性计算：人们追求回报最大、成本最小的关系。","cat":"社会心理学"},{"id":81,"t":"自我决定理论 (Self-Determination Theory)","s":"人类有三种基本心理需要：自主、胜任、归属，满足它们才能实现最佳发展和幸福。","cat":"动机心理学"},{"id":82,"t":"心理韧性 (Resilience)","s":"面对逆境、创伤和压力时能够反弹和适应的能力，是可培养的心理「肌肉」。","cat":"积极心理学"},{"id":83,"t":"成长型思维 (Growth Mindset)","s":"相信能力可以通过努力发展，而非固定不变。这种信念使人更愿意面对挑战、更坚韧。","cat":"教育心理学"},{"id":84,"t":"煤气灯效应 (Gaslighting)","s":"通过持续否认、扭曲事实使受害者怀疑自己的感知和判断，是一种心理操纵。","cat":"社会心理学"},{"id":85,"t":"情绪感染 (Emotional Contagion)","s":"人们会无意识地「捕捉」他人的情绪，情绪像病毒一样在人际间传播。","cat":"情绪心理学"},{"id":86,"t":"去个性化 (Deindividuation)","s":"在群体中个体失去自我意识和个人责任感，做出平时不会做的行为。","cat":"社会心理学"},{"id":87,"t":"自我实现 (Self-Actualization)","s":"充分发挥个人潜能、成为自己所能成为的「最好的自己」的最高心理需要。","cat":"人本主义心理学"},{"id":88,"t":"正念 (Mindfulness)","s":"有意识地将注意力集中在当下、不加评判地觉察此时此刻的体验。","cat":"积极心理学"},{"id":89,"t":"间隔重复 (Spaced Repetition)","s":"将复习间隔逐渐拉长，在即将遗忘时进行复习，以最少时间实现最强记忆。","cat":"认知心理学"},{"id":90,"t":"测试效应 (Testing Effect)","s":"主动回忆比反复重读更能巩固记忆，测试不仅是评估手段，更是强大的学习工具。","cat":"认知心理学"},{"id":91,"t":"情感预测偏差 (Affective Forecasting)","s":"人们预测自己未来的情绪时常出错——高估事件对情绪的影响强度和持续时间。","cat":"认知心理学"},{"id":92,"t":"自我监控 (Self-Monitoring)","s":"个体在社交中观察和控制自我呈现的程度，高自我监控者随情境调整行为。","cat":"人格心理学"},{"id":93,"t":"内外控倾向 (Locus of Control)","s":"个体认为结果由自己控制（内控）还是外部力量决定（外控）的信念差异。","cat":"人格心理学"},{"id":94,"t":"创伤后成长 (Post-Traumatic Growth)","s":"经历重大创伤后，部分人不仅恢复，还在多个领域获得超越创伤前的积极心理变化。","cat":"积极心理学"},{"id":95,"t":"旁观者干预模型 (Bystander Intervention Model)","s":"解释为什么在场人数越多，个体越不可能提供帮助的五步决策模型。","cat":"社会心理学"},{"id":96,"t":"认知评价理论 (Cognitive Appraisal Theory)","s":"情绪产生于对事件的认知评价：同一事件被评价为威胁则焦虑，被评价为挑战则兴奋。","cat":"情绪心理学"}]

function pickDailyCard() {
  const c = DAILY_CARDS[rand(DAILY_CARDS.length)]
  return {
    type: 'auto',
    category: 'general',
    image: null,
    title: c.t,
    content: c.s,
    username: '每日一卡',
    user_type: 'system',
    source_api: 'daily-card',
    is_auto_push: true,
  }
}

// 图片治愈配文：有 key 时由 DeepSeek 生成，否则返回 null 走模板
async function generateCaption(context) {
  if (!DEEPSEEK_API_KEY) return null
  try {
    const text = await aiChat(
      '你是温柔的内容编辑，为中文心理疗愈社区「心灵晴天」写图片配文。要求：1-2 句，克制、有画面感、不煽情。',
      `为一张「${context}」的图片写一句温柔的配文。只返回这句话。`
    )
    return text.trim().replace(/^["“”]|["“”]$/g, '') || null
  } catch (e) {
    console.error('AI 生成配文失败：', e.message)
    return null
  }
}

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

  // 有 DeepSeek key 时为图片额外生成温柔配文（失败降级静态文案）
  const [dogCap, catCap, natureCap] = await Promise.all([
    generateCaption('狗狗'),
    generateCaption('猫咪'),
    generateCaption('自然风景'),
  ])

  const posts = []
  dogUrls.filter(Boolean).forEach((url, i) =>
    posts.push(autoPost('dog', url, DOG_TITLES[i % DOG_TITLES.length], dogCap || DOG_CONTENT, 'dog.ceo'))
  )
  catUrls.filter(Boolean).forEach((url, i) =>
    posts.push(autoPost('cat', url, CAT_TITLES[i % CAT_TITLES.length], catCap || CAT_CONTENT, 'cataas'))
  )
  natureUrls.filter(Boolean).forEach((url, i) =>
    posts.push(autoPost('nature', url, NATURE_TITLES[i % NATURE_TITLES.length], natureCap || NATURE_CONTENT, 'picsum'))
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

  // 每日一卡：从已有心理卡片资产中随机挑一张，复用其内容
  posts.push(pickDailyCard())

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
