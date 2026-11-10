/**
 * sceneAudit —— 模型生成画面的静态审计与 srcdoc 组装（M7）
 *
 * 为什么单独成模块：
 *   1. 这是**安全边界**。渲染隔离（sandbox）与网络隔离（CSP）都是浏览器行为，
 *      而这里是「要不要把它送进浏览器」的闸门。闸门本身必须可单测。
 *   2. 组件里写正则无法覆盖用例，改了也不知道有没有漏 —— 这份代码只允许
 *      「在 verify-scene-audit.mjs 全绿时」才改。
 *
 * 三道防线的关系（缺一不可）：
 *   - 本模块：尽量早地拦掉明显有问题的代码（省一次白屏、也少一次暴露面）
 *   - sandbox="allow-scripts"（无 allow-same-origin）：即使漏了，也碰不到父页面
 *   - CSP default-src 'none'：即使漏了，也发不出请求
 * ⚠️ 本模块**不是**唯一防线。它的 false negative 由后两道兜住，
 *    但 false positive（误杀）会直接表现为「她画不出来」，所以要谨慎加规则。
 */

/** 单帧代码体积上限（字节）。超过不渲染 —— 卡片只有 230px 高，更大的东西也不适合塞这里。 */
export const SCENE_MAX_BYTES = 12000

/** 注入到 srcdoc 里的 CSP。必须落在 <head> 内，放 <!DOCTYPE> 之前会被部分浏览器忽略。 */
const CSP =
  `<meta http-equiv="Content-Security-Policy" content="` +
  `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; ` +
  `img-src data:; base-uri 'none'; form-action 'none'">`

/** 包裹式组装时的基础样式：抹掉 body 默认边距，避免卡片里出现 8px 白边 */
const BASE_CSS =
  'html,body{margin:0;padding:0;height:100%;background:transparent;overflow:hidden}' +
  '*{box-sizing:border-box}'

/**
 * 首帧探针。
 *
 * 为什么需要它：iframe 是 opaque origin（没有 allow-same-origin），父页面**读不到**它的 DOM，
 * 所以「画出来了没有」只能由它自己报信。等两个 rAF = 等首帧真的进了合成器，
 * 比 `load` 更接近「用户真的看得见」。
 *
 * 三个约束：
 *   - 必须是**独立的 `<script>`**：模型代码里若有语法错误/死循环，不会连累这一段
 *     （死循环仍会连累 —— 那种情况靠 10s 硬闸兜底）
 *   - 不能有任何插值：这是固定字符串，模型无法改写
 *   - 用 `parent.postMessage` 而不是 `console`/`document.title`：只有它能穿过 opaque origin
 */
const PAINT_PROBE =
  `<script>(function(){var n=0;function t(){if(++n>1){try{parent.postMessage('xm-scene-paint','*')}catch(e){}}` +
  `else requestAnimationFrame(t)}requestAnimationFrame(t)})();</script>`

/** 把探针接到文档末尾（放在 </body> 之前，避免落在 body 外） */
function appendProbe(doc) {
  if (/<\/body\s*>/i.test(doc)) return doc.replace(/<\/body\s*>/i, PAINT_PROBE + '</body>')
  return doc + PAINT_PROBE
}

/* ------------------------------------------------------------------ *
 * 审计
 * ------------------------------------------------------------------ */

/**
 * 剥掉 xmlns 命名空间声明。
 *
 * 🔴 这条曾经让整个功能被误判：`xmlns="http://www.w3.org/2000/svg"` 是**命名空间标识符**，
 * 不是网络请求，但字面上含 `http://`。不剥掉的话，所有内联 SVG 都会被判「含外部链接」，
 * 于是「模型不会画 SVG」—— 一个纯粹的假结论。
 */
function stripXmlns(code) {
  return code.replace(/\sxmlns(:[\w.-]+)?\s*=\s*("[^"]*"|'[^']*')/gi, '')
}

/** 剥掉 HTML 注释：注释是惰性的，里面的 URL 发不出请求，但很常见（"参考 http://..."） */
function stripHtmlComments(code) {
  return code.replace(/<!--[\s\S]*?-->/g, '')
}

/** 抽出所有内联 <script> 的正文，用于语法编译检查 */
function scriptBodies(code) {
  const out = []
  const re = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi
  let m
  while ((m = re.exec(code))) out.push(m[1])
  return out
}

/**
 * 审计一段模型生成的代码。
 * @param {string} code
 * @returns {{ ok: boolean, issues: string[] }}
 */
export function auditScene(code) {
  const raw = String(code == null ? '' : code)
  const issues = []

  if (!raw.trim()) return { ok: false, issues: ['空代码'] }

  // 体积先判：没必要对 1MB 的字符串跑十几个正则
  if (raw.length > SCENE_MAX_BYTES) {
    return { ok: false, issues: [`体积超限 ${raw.length}B > ${SCENE_MAX_BYTES}B`] }
  }

  const bare = stripHtmlComments(stripXmlns(raw))

  // ---- 1. 外链：会把用户 IP / 打开行为漏给第三方 ----
  if (/\bhttps?:\/\//i.test(bare)) issues.push('含外部链接')

  // ---- 2. 网络请求：外传数据的直接手段 ----
  if (/\b(fetch|importScripts)\s*\(|XMLHttpRequest|new\s+WebSocket|new\s+EventSource|sendBeacon|\.submit\s*\(/i.test(bare)) {
    issues.push('含网络请求')
  }

  // ---- 3. 动态导入 ----
  if (/\b(import|require)\s*\(/.test(bare)) issues.push('含动态导入')

  // ---- 4. 宿主环境：sandbox 已挡住，但没必要让可疑代码上线 ----
  if (/window\.(parent|top|opener)|localStorage|sessionStorage|indexedDB|document\.cookie/i.test(bare)) {
    issues.push('访问宿主环境')
  }

  // ---- 5. 动态执行 ----
  if (/\beval\s*\(|new\s+Function\s*\(|document\.write/i.test(bare)) issues.push('含动态执行')

  // ---- 6. 外链脚本 ----
  if (/<script[^>]+\bsrc\s*=/i.test(bare)) issues.push('外链脚本')

  // ---- 7. 必须是能看的东西 ----
  if (!/<canvas|<svg/i.test(bare)) issues.push('既没有 canvas 也没有 svg')

  // ---- 8. 死循环：会卡死 iframe（不卡父页面，但用户看到的是白屏 + 风扇狂转） ----
  if (/while\s*\(\s*(true|1)\s*\)/.test(bare)) issues.push('含死循环')

  // ---- 9. 语法编译（只编译不执行）----
  //    模型写坏一个括号很常见；与其让它是白屏，不如直接不出卡片。
  for (const src of scriptBodies(bare)) {
    try {
      // eslint-disable-next-line no-new-func
      new Function(src)
    } catch (e) {
      issues.push(`脚本语法错误：${String(e && e.message).slice(0, 80)}`)
      break
    }
  }

  return { ok: issues.length === 0, issues }
}

/* ------------------------------------------------------------------ *
 * srcdoc 组装
 * ------------------------------------------------------------------ */

/**
 * 把模型给的代码片段组装成 iframe 的 srcdoc 文档，并把 CSP 插进 <head>。
 *
 * 三种输入形态都要认：
 *   - 完整文档（含 <head> / <html> / <!DOCTYPE>）→ 只在 head 内插 CSP
 *   - 纯片段（最常见）→ 自己包一层 html/head/body，顺便带上基础样式
 */
export function toSrcDoc(code) {
  const src = String(code == null ? '' : code)

  if (/<head[^>]*>/i.test(src)) {
    return appendProbe(src.replace(/<head[^>]*>/i, (m) => m + CSP))
  }
  if (/<html[^>]*>/i.test(src)) {
    return appendProbe(src.replace(/<html[^>]*>/i, (m) => m + '<head>' + CSP + '</head>'))
  }
  if (/<!doctype[^>]*>/i.test(src)) {
    return appendProbe(src.replace(/<!doctype[^>]*>/i, (m) => m + '<head>' + CSP + '</head>'))
  }

  // 片段：去掉游离的结束标签（模型偶尔会写 </body></html>，包裹后会破结构）
  const body = src.replace(/<\/(body|html)\s*>/gi, '')
  return `<!DOCTYPE html><html><head>${CSP}<style>${BASE_CSS}</style></head><body>${body}${PAINT_PROBE}</body></html>`
}
