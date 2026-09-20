/**
 * 小木动作库 v1 —— 三轨动作系统的「动作轨」定义表
 *
 * 三轨模型：
 *   状态轨  state  —— 基线循环（idle/talk/think/happy/sleep/drag），永不停，见 useXiaomuState
 *   动作轨  action —— 一次性播完自动回基线；hold 型由调用方 releaseAction() 结束
 *   微表情轨 micro —— 耳/眼/嘴/腮红叠加层，不打断前两轨
 *
 * 池：
 *   idle  —— 空闲随机池，状态机每 8~20s 抽一个播（像真人发呆）
 *   touch —— 用户触摸交互触发
 *   chat  —— 聊天流程事件触发
 *   hold  —— 长按型，pointerup 结束
 *
 * 所有动画实现见 ../styles/xiaomu-animations.css（data-action 驱动，纯 transform/opacity）。
 */

export const ACTIONS = {
  /* ---- idle 随机池（8 个） ---- */
  lookAround:  { name: '左右张望',   pool: 'idle', duration: 2200, weight: 2 },
  stretch:     { name: '伸懒腰',     pool: 'idle', duration: 2800 },
  scratchHead: { name: '挠头',       pool: 'idle', duration: 2200 },
  tiptoe:      { name: '踮脚张望',   pool: 'idle', duration: 1500 },
  yawn:        { name: '打哈欠',     pool: 'idle', duration: 2600, weight: 0.5 },
  touchLeaf:   { name: '碰叶子',     pool: 'idle', duration: 2200, weight: 2 },   // 木灵专属彩蛋
  swayLeaf:    { name: '摇叶芽',     pool: 'idle', duration: 1800 },
  hopSteps:    { name: '原地小碎步', pool: 'idle', duration: 1700, weight: 0.7 },

  /* ---- 触摸交互 ---- */
  surprise:    { name: '惊讶回看',   pool: 'touch', duration: 1300 },
  jumpJoy:     { name: '小跳+爱心',  pool: 'touch', duration: 1000, fx: 'hearts' },
  headPat:     { name: '摸头眯眼',   pool: 'hold',  duration: 0, hold: true,
                 micro: ['eyesClosed', 'blush', 'earDroop'] },

  /* ---- 聊天事件 ---- */
  leanIn:      { name: '凑近看',     pool: 'chat', duration: 900 },               // 气泡出场时
  apologetic:  { name: '拘谨抱歉',   pool: 'chat', duration: 2300, micro: ['earDroop'] },
}

/** 微表情定义（可叠加，duration 0 = 由调用方管理生命周期） */
export const MICRO_EXPRESSIONS = {
  blush:      { name: '腮红加深', duration: 2400 },
  eyesClosed: { name: '眯眼',     duration: 0 },   // 默认常驻，直到清除
  eyesWide:   { name: '眼睛睁大', duration: 1200 },
  earDroop:   { name: '耳朵/叶芽蔫', duration: 0 },
}

/** 状态合法值（动作轨遇到 sleep/drag 时静默） */
export const STATES = ['idle', 'talk', 'think', 'happy', 'sleep', 'drag']

/**
 * 从 idle 池加权随机抽一个动作，且不与上一个重复（连续张望两次太假）。
 * @param {string|null} lastName 上一个动作名
 * @param {(name: string, weight: number) => number} [modFn] 权重调制器（M2 mood 档位），
 *        返回调制后权重；不传 = 原始权重（M1 行为不变）。调制结果有 0.05 下限，
 *        避免某动作被彻底禁绝。
 * @returns {string} 动作名
 */
export function pickIdleAction(lastName = null, modFn = null) {
  const entries = Object.entries(ACTIONS).filter(([, d]) => d.pool === 'idle')
  const pool = lastName ? entries.filter(([k]) => k !== lastName) : entries
  const eff = (k, d) => Math.max(0.05, modFn ? modFn(k, d.weight ?? 1) : (d.weight ?? 1))
  const total = pool.reduce((s, [k, d]) => s + eff(k, d), 0)
  let r = Math.random() * total
  for (const [k, d] of pool) {
    r -= eff(k, d)
    if (r <= 0) return k
  }
  return pool[pool.length - 1][0]
}

/** 按用途取动作名（避免魔法字符串散落） */
export const ACTION = Object.freeze({
  // 触摸
  SURPRISE: 'surprise',
  JUMP_JOY: 'jumpJoy',
  HEAD_PAT: 'headPat',
  // 聊天
  LEAN_IN: 'leanIn',
  APOLOGETIC: 'apologetic',
  // idle（供外部特殊调度，如「回来伸懒腰」「回复完摇叶芽」）
  STRETCH: 'stretch',
  YAWN: 'yawn',
  SWAY_LEAF: 'swayLeaf',
  // M2 情绪演绎复用（idle 池动作借用为即时表演）
  SCRATCH_HEAD: 'scratchHead',
})
