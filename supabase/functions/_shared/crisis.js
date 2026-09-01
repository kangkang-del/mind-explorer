// 全站危机干预「统一中间件」——服务端唯一来源
// 各输入点（小木对话 / 心情日记 / 治愈瞬间投稿）统一调用本模块的 detectCrisis，
// 命中即返回 crisis 标志，由前端弹援助资源，避免逻辑分散、各写各的。
//
// 注意：前端 src/lib/crisis.js 与本文件保持同步（不同运行时无法共享，关键词需手动对齐）。

// 高危关键词（覆盖自伤/轻生/极端绝望等表达；宁可多报，误报仅是多展示资源）
export const CRISIS_KEYWORDS = [
  '想死', '不想活', '活不下去', '活着的', '活着没意思', '活着真累',
  '没意义', '自杀', '轻生', '结束生命', '结束自己', '结束这一切',
  '伤害自己', '伤害我自己', '割腕', '割自己', '划自己', '跳楼', '跳下去',
  '吃安眠药', '吞药', '烧炭', '上吊',
  '解脱', '不如死', '去死', '一了百了', '不如消失', '想消失', '消失算了',
  '撑不下去', '没有活着的必要', '活不下去了', '不想活了',
  'suicide', 'kill myself', 'end my life', 'self harm', 'cut myself',
]

// 国内可核验的心理援助热线（按官方公开信息）
export const HOTLINES = [
  { name: '全国 24 小时心理援助热线', number: '400-161-9995' },
  { name: '北京心理危机研究与干预中心', number: '010-82951332' },
  { name: '青少年心理咨询热线', number: '12355' },
  { name: '妇女维权热线（反家暴）', number: '12338' },
]

export function detectCrisis(text = '') {
  const t = String(text || '')
  return CRISIS_KEYWORDS.some((k) => t.includes(k))
}

// 热线文本块（用于拼接进小木的回复）
export function crisisResourceText() {
  return HOTLINES.map((h) => `· ${h.name}：${h.number}`).join('\n')
}

// 危机时的温柔回复（不替代专业帮助，只接住 + 给资源）
export function crisisReply() {
  return (
    '我听到了你此刻很重的疲惫，也很心疼。我想轻轻告诉你：你不需要一个人扛着这些。\n' +
    '寻求帮助不是软弱，而是对自己温柔的勇气。如果你愿意，可以拨打援助热线：\n' +
    crisisResourceText() +
    '\n我会一直在这里陪着你，但你值得被真实地接住。'
  )
}
