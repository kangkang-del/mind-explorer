// 前端 gzip 压缩/解压（使用浏览器原生 CompressionStream API）
// 用于压缩超长卡片内容，避免请求体过大触发 400 错误

export async function gzipToString(str) {
  const cs = new CompressionStream('gzip')
  const stream = new Blob([str]).stream().pipeThrough(cs)
  const buf = await new Response(stream).arrayBuffer()
  return uint8ToBase64(new Uint8Array(buf))
}

export async function gunzipFromString(b64) {
  const bytes = base64ToUint8(b64)
  const ds = new DecompressionStream('gzip')
  const stream = new Blob([bytes]).stream().pipeThrough(ds)
  return await new Response(stream).text()
}

function uint8ToBase64(bytes) {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

function base64ToUint8(b64) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
