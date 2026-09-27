/**
 * storybook.js —— 「小木记得的你」故事书：叙事脚本 + 导出器（M4 批次 O2/O3）
 *
 * 纯模块，零依赖（不 import Vue / DOM / 任何第三方）。这样：
 *   ① 可以在 Node 里直接单测（见 .workbuddy/js/verify-story-o.mjs）；
 *   ② 叙事逻辑与页面渲染解耦 —— 「讲什么」与「怎么演」是两件事，
 *      页面只负责把这里产出的段落数组一段段呈现/打字机。
 *
 * ── 硬约束（任务清单 O2） ────────────────────────────────────
 *   单文件 HTML、**离线可打开**、**无外链**、**不依赖 CDN**：
 *     - 样式全部内联在 <style>（不使用任何外部字体 / CSS 框架）
 *     - 数据内联为 <script type="application/json">（不是 fetch 来的）
 *     - 不写 http(s):// 的资源引用（测试会断言这一点）
 *     - 字体只用系统字体栈（PingFang SC / Microsoft YaHei / system-ui）
 *
 * ── 隐私 ─────────────────────────────────────────────────
 *   传入的 moments 已经是服务端截断后的文本，本模块**只做转义与排版**，
 *   不拼接、不还原、不额外补全任何原文。
 */

/** HTML 文本转义（导出内容来自用户输入，必须转义，否则导出的文件自带 XSS） */
export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 内联 JSON 安全化：把 </script 与行分隔符打断，避免提前闭合脚本标签 */
export function jsonForScript(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export const EMOTION_META = {
  anxious: { label: '焦虑', emoji: '😟', color: '#9db8cc' },
  low: { label: '低落', emoji: '🌧️', color: '#a8b8c4' },
  angry: { label: '愤怒', emoji: '😣', color: '#d4a79b' },
  lost: { label: '迷茫', emoji: '🌫️', color: '#c3c9cf' },
  calm: { label: '平静', emoji: '🍃', color: '#a8cbb4' },
  grateful: { label: '温暖', emoji: '🌤️', color: '#e8c48f' },
}

const EMOTION_CN = {
  low: '低落', anxious: '焦虑', angry: '愤怒', lost: '迷茫', grateful: '温暖', calm: '平静',
}

/** 情绪柱高度档位（页面与导出共用同一套视觉语义：越暖越高） */
const MOOD_BAR = {
  anxious: { color: '#9db8cc', h: 30 },
  low: { color: '#a8b8c4', h: 22 },
  angry: { color: '#d4a79b', h: 38 },
  lost: { color: '#c3c9cf', h: 30 },
  calm: { color: '#a8cbb4', h: 62 },
  grateful: { color: '#e8c48f', h: 88 },
}

/** 情绪时间线 → 柱状图数据（按天聚合，取当日最后一条情绪，最多 60 天） */
export function moodBars(moods) {
  const byDay = new Map()
  for (const m of Array.isArray(moods) ? moods : []) {
    const k = (m?.at || '').slice(0, 10)
    if (!k) continue
    byDay.set(k, m)   // 后者覆盖前者 = 当日最后一条
  }
  return [...byDay.entries()].slice(-60).map(([day, m]) => {
    const meta = EMOTION_META[m.emotion] || { label: m.emotion || '—', emoji: '🍃' }
    const bar = MOOD_BAR[m.emotion] || { color: '#c9d4dc', h: 50 }
    const d = day.slice(5).replace('-', '/')
    return { h: bar.h, color: bar.color, title: `${d} ${meta.emoji}${meta.label}` }
  })
}

/** 片段的时间显示（月/日） */
export function fmtMoment(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/**
 * 组装叙事脚本：返回段落数组（纯数据）。
 * 页面把它一段段演出来，导出只是把同一份数据排版成 HTML —— 两侧同源，不会各说各话。
 *
 * 段落类型：
 *   narrate  小木的旁白（可逐字打出）
 *   chapter  章节标题
 *   moods    情绪柱（可视化，不配音）
 *   moment   对话片段（服务端已截断）
 *   ending   结尾
 */
export function buildNarrative(payload) {
  const segs = []
  const p = payload?.profile || {}
  const stats = payload?.stats || {}
  const days = Number(payload?.days) || 0
  const rangeWord = days > 0 ? `近 ${days} 天` : '从我们认识那天起'
  const name = p.nickname || '你'
  const moments = Array.isArray(payload?.moments) ? payload.moments : []

  // ① 开场
  segs.push({ kind: 'narrate', text: `让我想想……关于「${name}」，我记得这些。` })

  // ② 陪伴轮次
  if (p.messageCount) {
    segs.push({ kind: 'narrate', text: `我们说过大约 ${p.messageCount} 轮话。每一次，我都收在心里了。` })
  }

  // ③ 小木的长期印象（summary 由服务端生成，≤80 字）
  if (p.summary) {
    segs.push({ kind: 'chapter', emoji: '🌱', text: '我眼里的你' })
    segs.push({ kind: 'narrate', text: p.summary })
  }

  // ④ 情绪时间线
  if (stats.moodCount) {
    const top = (p.emotions?.top || [])[0]
    segs.push({ kind: 'chapter', emoji: '🌤️', text: '你心情的样子' })
    segs.push({
      kind: 'narrate',
      text: [
        `${rangeWord}，你记下了 ${stats.moodCount} 次心情`,
        stats.activeMoodDays ? `，散在 ${stats.activeMoodDays} 天里` : '',
        top ? `。出现最多的是「${EMOTION_CN[top.emotion] || top.emotion}」` : '',
        '。',
      ].join(''),
    })
    const bars = moodBars(payload.moods || [])
    if (bars.length) segs.push({ kind: 'moods', items: bars })
  }

  // ⑤ 关键片段
  if (moments.length) {
    segs.push({ kind: 'chapter', emoji: '💬', text: '我们说过的话' })
    segs.push({
      kind: 'narrate',
      text: `这里有一些片段，一共 ${stats.momentCount || moments.length} 段——我留着的，不是全部，只是我常常想起的那些。`,
    })
    for (const m of moments) {
      if (!m?.text) continue
      segs.push({
        kind: 'moment',
        role: m.role,
        text: m.text,
        clipped: !!m.clipped,
        time: fmtMoment(m.at),
      })
    }
  }

  // ⑥ 结尾
  segs.push({
    kind: 'ending',
    text: moments.length || stats.moodCount
      ? '这就是我记得的你。以后还会有更多。'
      : '我们还刚刚开始。',
  })
  return segs
}

/** 文件名：xiaomu-storybook-YYYY-MM-DD.html */
export function storybookFilename(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  const pad = (n) => String(n).padStart(2, '0')
  return `xiaomu-storybook-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.html`
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function fmtDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 生成故事书 HTML。
 * @param {object} p
 * @param {object} p.profile  { nickname, messageCount, summary, emotions }
 * @param {Array}  p.moods    [{ emotion, note, at }]
 * @param {Array}  p.moments  [{ role, text, clipped, at }]   ← 已截断
 * @param {object} p.stats    { moodCount, momentCount, activeMoodDays }
 * @param {number} p.days     0 = 全部
 * @param {Date}   p.exportedAt
 * @param {boolean} p.isGuest
 */
export function buildStorybookHtml(p = {}) {
  const profile = p.profile || {}
  const moods = Array.isArray(p.moods) ? p.moods : []
  const moments = Array.isArray(p.moments) ? p.moments : []
  const stats = p.stats || {}
  const days = Number(p.days) || 0
  const rangeLabel = days > 0 ? `近 ${days} 天` : '全部记录'
  const name = profile.nickname || '你'
  const exported = p.exportedAt instanceof Date ? p.exportedAt : new Date()

  // ── 空数据：照样能导出，但给明确提示（O3 要求） ──
  const isEmpty = !stats.moodCount && !stats.momentCount && !profile.summary

  // 情绪分布
  const tally = {}
  for (const m of moods) {
    const k = m?.emotion
    if (k) tally[k] = (tally[k] || 0) + 1
  }
  const tallyRows = Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => {
      const meta = EMOTION_META[k] || { label: k, emoji: '🍃', color: '#c9d4dc' }
      const pct = moods.length ? Math.round((n / moods.length) * 100) : 0
      return `<div class="tl-row">
        <span class="tl-key">${esc(meta.emoji)} ${esc(meta.label)}</span>
        <span class="tl-bar"><i style="width:${pct}%;background:${meta.color}"></i></span>
        <span class="tl-num">${n} 次 · ${pct}%</span>
      </div>`
    }).join('')

  // 心情列表（倒序，最近在上）
  const moodRows = moods.slice().reverse().map((m) => {
    const meta = EMOTION_META[m.emotion] || { label: m.emotion || '—', emoji: '🍃' }
    return `<li class="mood-row">
      <span class="mood-date">${esc(fmtDateTime(m.at))}</span>
      <span class="mood-tag">${esc(meta.emoji)} ${esc(meta.label)}</span>
      ${m.note ? `<span class="mood-note">${esc(m.note)}</span>` : ''}
    </li>`
  }).join('')

  // 对话片段
  const momentRows = moments.map((m) => {
    const who = m.role === 'user' ? '你' : '小木'
    const cls = m.role === 'user' ? 'is-user' : 'is-xm'
    return `<div class="msg ${cls}">
      <span class="msg-meta">${esc(who)} · ${esc(fmtDateTime(m.at))}</span>
      <span class="msg-text">${esc(m.text)}${m.clipped ? '…' : ''}</span>
    </div>`
  }).join('')

  const summaryBlock = profile.summary
    ? `<section class="card">
        <h2>🌱 小木眼里的你</h2>
        <p class="summary">${esc(profile.summary)}</p>
      </section>`
    : ''

  const emptyBlock = isEmpty
    ? `<section class="card empty">
        <h2>🕊️ 还是一片空白</h2>
        <p>这段时间里，小木还没有留下任何关于你的记忆。去和小木说说话，或者记一笔心情，
        下次导出时，这里就会写满你们的故事了。</p>
      </section>`
    : ''

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>小木记得的你 · ${esc(name)}</title>
<style>
  :root {
    --ink: #2b2b2b; --ink-2: #5a6b7c; --ink-3: #9aa6b2; --line: #e6efe9;
    --accent: #7c9cb8; --accent-2: #a8cbb4; --bg: #fbfdfb;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 28px 16px 56px;
    background: linear-gradient(180deg, #fbfdfb 0%, #f5f9f7 100%);
    color: var(--ink);
    font-family: 'PingFang SC', 'Microsoft YaHei', system-ui, -apple-system, 'Segoe UI', sans-serif;
    line-height: 1.75; font-size: 15px;
  }
  .wrap { max-width: 720px; margin: 0 auto; }
  header.book-head { text-align: center; margin-bottom: 28px; }
  .sprout { font-size: 40px; line-height: 1; }
  header.book-head h1 { font-size: 24px; margin: 10px 0 6px; }
  header.book-head .sub { font-size: 13px; color: var(--ink-3); margin: 0; }
  .card {
    background: #fff; border: 1px solid var(--line); border-radius: 16px;
    padding: 18px 20px; margin-bottom: 16px;
  }
  .card h2 { font-size: 15px; margin: 0 0 12px; color: var(--ink); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; }
  .grid .k { color: var(--ink-3); font-size: 13.5px; }
  .grid .v { color: var(--ink); font-size: 13.5px; }
  .summary { margin: 0; color: var(--ink-2); }
  .tl-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-size: 13.5px; }
  .tl-key { width: 78px; flex: none; color: var(--ink-2); }
  .tl-bar { flex: 1; height: 9px; background: #f0f4f2; border-radius: 99px; overflow: hidden; }
  .tl-bar i { display: block; height: 100%; border-radius: 99px; }
  .tl-num { width: 92px; flex: none; text-align: right; color: var(--ink-3); font-size: 12px; }
  ul.moods { list-style: none; margin: 0; padding: 0; }
  .mood-row { display: flex; gap: 10px; align-items: baseline; padding: 7px 0; border-bottom: 1px solid #f3f7f4; }
  .mood-row:last-child { border-bottom: 0; }
  .mood-date { flex: none; width: 118px; color: var(--ink-3); font-size: 12px; }
  .mood-tag { flex: none; color: var(--ink-2); font-size: 13px; }
  .mood-note { color: var(--ink-3); font-size: 12.5px; overflow-wrap: anywhere; }
  .msg { max-width: 84%; margin: 0 0 10px; padding: 9px 13px; border-radius: 14px; font-size: 13.5px; }
  .msg.is-xm { background: #fff; border: 1px solid var(--line); border-bottom-left-radius: 4px; }
  .msg.is-user { background: #eef4f9; color: #4a6a8a; margin-left: auto; border-bottom-right-radius: 4px; }
  .msg-meta { display: block; font-size: 10.5px; color: var(--ink-3); margin-bottom: 3px; }
  .msg-text { overflow-wrap: anywhere; }
  footer.book-foot { text-align: center; color: var(--ink-3); font-size: 12px; margin-top: 30px; }
  .empty p { color: var(--ink-2); margin: 0; }
  @media (max-width: 520px) {
    body { padding: 20px 12px 40px; font-size: 14.5px; }
    .grid { grid-template-columns: 1fr; }
    .tl-key { width: 66px; }
    .tl-num { width: 76px; }
    .mood-row { flex-wrap: wrap; }
    .mood-date { width: auto; }
    .msg { max-width: 94%; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header class="book-head">
    <div class="sprout">🌿</div>
    <h1>小木记得的你</h1>
    <p class="sub">${esc(name)} · ${esc(rangeLabel)} · 导出于 ${esc(fmtDateTime(exported.toISOString()))}</p>
  </header>

  ${emptyBlock}

  <section class="card">
    <h2>🪴 一点统计</h2>
    <div class="grid">
      <span class="k">陪伴轮次</span><span class="v">${esc(profile.messageCount || 0)} 轮对话</span>
      <span class="k">心情记录</span><span class="v">${esc(stats.moodCount || 0)} 条${stats.activeMoodDays ? ` · 分布在 ${esc(stats.activeMoodDays)} 天` : ''}</span>
      <span class="k">对话片段</span><span class="v">${esc(stats.momentCount || 0)} 段</span>
      <span class="k">最近一次说话</span><span class="v">${esc(fmtDate(profile.lastSeenAt) || '—')}</span>
    </div>
  </section>

  ${summaryBlock}

  ${tallyRows ? `<section class="card"><h2>🌤️ 情绪的分布</h2>${tallyRows}</section>` : ''}

  ${moodRows ? `<section class="card"><h2>📅 心情记录</h2><ul class="moods">${moodRows}</ul></section>` : ''}

  ${momentRows ? `<section class="card"><h2>💬 我们说过的话</h2>${momentRows}</section>` : ''}

  <footer class="book-foot">
    <p>这份故事书由「心灵探索 · 小木」导出，可在离线状态下打开。</p>
    <p>${esc(p.isGuest ? '当前为本机临时身份，登录后记忆才能跨设备保存。' : '')}</p>
  </footer>
</div>
<script type="application/json" id="story-data">${jsonForScript({ moments: moments.length, moods: moods.length, days })}<\/script>
</body>
</html>
`
}
