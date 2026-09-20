/**
 * useXiaomuSkin —— 自定义形象（图片皮肤）本地存储与处理（M3 批次 J，任务 J1）
 *
 * 全链路本地，图片不出浏览器：
 *   File → canvas 等比缩到 ≤512px → Blob(webp/png) → IndexedDB(xm-skin-db/skins/current)
 *   → URL.createObjectURL → <img> 渲染层（XiaomuSvg 的 .xm-skin）
 *
 * 隐私：不上传任何服务器（跨设备同步归 M4 记忆体系）。
 * 兜底：IndexedDB 不可用（无痕/隐私模式）时降级为「仅本次会话有效」，回报 persist:false 并提示。
 * 模块级单例：XiaomuPet（渲染）与 XiaomuWardrobe（上传/清除 UI）共享同一份 URL 与元数据。
 */
import { computed, ref } from 'vue'

const DB_NAME = 'xm-skin-db'
const STORE = 'skins'
const REC = 'current'
const MAX_SIDE = 512                                   // 最长边上限（px）
const MAX_BYTES = 8 * 1024 * 1024                      // 原始文件上限
const OK_TYPES = /^image\/(png|jpe?g|webp|gif|bmp|avif)$/i

/* ---- 模块级单例状态 ---- */
const url = ref('')            // 当前皮肤的 objectURL（'' = 无自定义形象）
const meta = ref(null)         // { w, h, type, at, persist }
const ready = ref(false)       // 首次 IDB 读取是否完成
const busy = ref(false)        // 缩放/落盘中
const error = ref('')
const hasSkin = computed(() => !!url.value)

let dbPromise = null
let booted = false

/* ---- IndexedDB 极简封装 ---- */
function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('当前环境不支持本地图片存储')); return }
    let req
    try { req = indexedDB.open(DB_NAME, 1) } catch (e) { reject(e); return }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('本地存储打开失败'))
    req.onblocked = () => reject(new Error('本地存储被其他标签页占用'))
  })
  return dbPromise
}

function idbRun(mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    let tx
    try { tx = db.transaction(STORE, mode) } catch (e) { reject(e); return }
    const req = fn(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(req ? req.result : undefined)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  }))
}

/* ---- 图片处理 ---- */
function decode(file) {
  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(src); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('这张图片读不出来，换一张试试')) }
    img.src = src
  })
}

function toBlob(cv, type, quality) {
  return new Promise((resolve) => {
    try { cv.toBlob((b) => resolve(b), type, quality) } catch { resolve(null) }
  })
}

/** 等比缩到最长边 ≤512，优先 webp（体积小、保留透明），不支持则回落 png */
async function shrink(file) {
  const img = await decode(file)
  const nw = img.naturalWidth || img.width || 1
  const nh = img.naturalHeight || img.height || 1
  const scale = Math.min(1, MAX_SIDE / Math.max(nw, nh))
  const w = Math.max(1, Math.round(nw * scale))
  const h = Math.max(1, Math.round(nh * scale))
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)
  let type = 'image/webp'
  let blob = await toBlob(cv, type, 0.92)
  if (!blob) { type = 'image/png'; blob = await toBlob(cv, type) }
  if (!blob) throw new Error('图片处理失败了，换一张试试')
  return { blob, w, h, type }
}

function applyURL(blob, m) {
  if (url.value) { try { URL.revokeObjectURL(url.value) } catch { /* 静默 */ } }
  url.value = URL.createObjectURL(blob)
  meta.value = m
}

/* ---- 对外接口 ---- */

/** 首读：从 IndexedDB 恢复上次上传的形象（幂等） */
async function load() {
  if (booted) { ready.value = true; return hasSkin.value }
  booted = true
  try {
    const rec = await idbRun('readonly', (s) => s.get(REC))
    if (rec && rec.blob) {
      applyURL(rec.blob, { w: rec.w, h: rec.h, type: rec.type, at: rec.at, persist: true })
    }
  } catch {
    // 隐私模式等：静默降级（并无形象可恢复）
  }
  ready.value = true
  return hasSkin.value
}

/** 上传：校验 → 缩放 → 落盘 → 立即生效（返回是否成功） */
async function upload(file) {
  error.value = ''
  if (!file) return false
  if (!OK_TYPES.test(file.type || '')) { error.value = '请选择图片文件（png / jpg / webp）'; return false }
  if (file.size > MAX_BYTES) { error.value = '图片有点大，建议 8MB 以内'; return false }
  busy.value = true
  try {
    const { blob, w, h, type } = await shrink(file)
    const rec = { id: REC, blob, w, h, type, at: Date.now() }
    let persist = true
    try { await idbRun('readwrite', (s) => s.put(rec)) } catch { persist = false }
    if (!persist) error.value = '这台设备无法长期保存图片，刷新后需要重新上传'
    applyURL(blob, { w, h, type, at: rec.at, persist })
    return true
  } catch (e) {
    error.value = (e && e.message) || '上传失败，请再试一次'
    return false
  } finally {
    busy.value = false
  }
}

/** 清除：删除本地记录并回到 SVG 形象 */
async function clear() {
  error.value = ''
  try { await idbRun('readwrite', (s) => s.delete(REC)) } catch { /* 静默 */ }
  if (url.value) { try { URL.revokeObjectURL(url.value) } catch { /* 静默 */ } }
  url.value = ''
  meta.value = null
  return true
}

function clearError() { error.value = '' }

function status() {
  return {
    hasSkin: hasSkin.value,
    url: url.value,
    meta: meta.value,
    ready: ready.value,
    busy: busy.value,
    error: error.value,
  }
}

export function useXiaomuSkin() {
  return {
    url, meta, ready, busy, error, hasSkin,
    load, upload, clear, clearError, status,
  }
}
