/**
 * 小木衣柜数据表 v1 —— M3 批次 H（纯数据，零依赖）
 *
 * 槽位：variant（皮肤）/ hat（帽子）/ scarf（围巾）/ bow（蝴蝶结）
 * 物品解锁两种方式：
 *   { type: 'free' }                    —— 直接可选
 *   { type: 'days', days: N }           —— 保底轨：累计使用 N 天
 *   { type: 'milestone', id: 'xxx' }    —— 彩蛋轨：达成情绪里程碑
 *
 * 里程碑（判定逻辑在 useXiaomuWardrobe，这里只放元数据）：
 *   joyful-stay —— 开心档（joyful）累计驻留 10 分钟
 *   recover     —— 从阴天/微雨档恢复到平静以上
 *   headpat-20  —— 摸头累计 20 次
 */

export const SLOTS = [
  { key: 'variant', name: '皮肤' },
  { key: 'hat', name: '帽子' },
  { key: 'scarf', name: '围巾' },
  { key: 'bow', name: '蝴蝶结' },
]

export const MILESTONES = {
  'joyful-stay': { name: '开心驻留', desc: '和它开心地待上 10 分钟' },
  recover: { name: '雨过天晴', desc: '陪它从低落里走出来' },
  'headpat-20': { name: '摸头之谊', desc: '摸摸头累计 20 次' },
}

export const ITEMS = [
  /* ---- 皮肤 ---- */
  { id: 'wood', slot: 'variant', name: '木灵', unlock: { type: 'free' }, desc: '头顶嫩芽的生长形' },
  { id: 'dog', slot: 'variant', name: '犬系', unlock: { type: 'days', days: 3 }, desc: '垂耳摇尾的陪伴形' },
  { id: 'custom', slot: 'variant', name: '我的形象', unlock: { type: 'free' }, desc: '上传一张图片' },

  /* ---- 帽子 ---- */
  { id: 'hat-none', slot: 'hat', name: '不戴', unlock: { type: 'free' } },
  { id: 'hat-beret', slot: 'hat', name: '贝雷帽', unlock: { type: 'days', days: 1 }, desc: '再来一天就送你' },
  { id: 'hat-straw', slot: 'hat', name: '草帽', unlock: { type: 'days', days: 7 }, desc: '陪伴满一周的心意' },
  { id: 'hat-flower', slot: 'hat', name: '小花冠', unlock: { type: 'milestone', id: 'joyful-stay' }, desc: '开心 10 分钟解锁' },

  /* ---- 围巾 ---- */
  { id: 'scarf-none', slot: 'scarf', name: '不戴', unlock: { type: 'free' } },
  { id: 'scarf-red', slot: 'scarf', name: '暖橙围巾', unlock: { type: 'days', days: 3 }, desc: '三天老朋友了' },
  { id: 'scarf-leaf', slot: 'scarf', name: '叶叶围巾', unlock: { type: 'milestone', id: 'recover' }, desc: '一起走过低落解锁' },

  /* ---- 蝴蝶结 ---- */
  { id: 'bow-none', slot: 'bow', name: '不戴', unlock: { type: 'free' } },
  { id: 'bow-pink', slot: 'bow', name: '粉色蝴蝶结', unlock: { type: 'free' }, desc: '老朋友了' },
  { id: 'bow-star', slot: 'bow', name: '星星结', unlock: { type: 'milestone', id: 'headpat-20' }, desc: '摸头 20 次解锁' },
]

/** 按槽位取物品列表（衣柜面板用） */
export function itemsOf(slot) {
  return ITEMS.filter((it) => it.slot === slot)
}

/** 按物品 id 查元数据 */
export function itemOf(id) {
  return ITEMS.find((it) => it.id === id) || null
}

/** 解锁条件的人类描述（锁定态显示） */
export function unlockText(item, activeDays) {
  const u = item.unlock
  if (u.type === 'free') return '免费'
  if (u.type === 'days') {
    const left = Math.max(0, u.days - (activeDays || 0))
    return left > 0 ? `陪伴满 ${u.days} 天（还差 ${left} 天）` : '已达成'
  }
  const m = MILESTONES[u.id]
  return m ? m.desc : '彩蛋解锁'
}

/** 摸头里程碑阈值（wardrobe 引擎与 UI 共用） */
export const HEAD_PAT_GOAL = 20
/** 开心驻留目标（毫秒） */
export const JOYFUL_STAY_GOAL = 10 * 60000
