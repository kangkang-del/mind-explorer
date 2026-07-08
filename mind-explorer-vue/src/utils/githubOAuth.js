/**
 * 纯前端 GitHub OAuth (Authorization Code + PKCE)
 *
 * 适用场景：部署在 GitHub Pages / Vercel / Netlify 等静态托管上
 * 无需后端服务器
 *
 * ⚠️ 安全说明：
 * - 使用 PKCE (code_challenge) 保护授权码
 * - client_secret 会暴露在前端代码中（对于开源学习项目可接受）
 * - 生产环境应使用后端代理
 */

// ===== 配置 =====
// 在实际使用时替换为你的 GitHub OAuth App 信息
const GITHUB_CLIENT_ID = ''  // TODO: 替换为你的 Client ID
const GITHUB_CLIENT_SECRET = '' // TODO: 替换为你的 Client Secret (仅用于静态托管方案)

// 回调地址 — 部署时根据实际情况修改
// GitHub Pages: https://<user>.github.io/<repo>/callback.html
// Netlify: https://<site>.netlify.app/mind-explorer/callback.html
const REDIRECT_URI = typeof window !== 'undefined'
  ? `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, '/')}/callback.html`
  : ''

// ===== PKCE 工具函数 =====

function generateRandomString(length) {
  const allowed = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const values = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(values, v => allowed[v % allowed.length]).join('')
}

async function sha256(plain) {
  const encoder = new TextEncoder()
  const data = encoder.encode(plain)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function base64urlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ===== 存储 PKCE 参数到 sessionStorage =====

export function storePKCE(verifier, state) {
  try {
    sessionStorage.setItem('pkce_verifier', verifier)
    sessionStorage.setItem('oauth_state', state)
  } catch (e) {
    console.warn('sessionStorage 不可用', e)
  }
}

export function getStoredPKCE() {
  try {
    return {
      verifier: sessionStorage.getItem('pkce_verifier'),
      state: sessionStorage.getItem('oauth_state')
    }
  } catch (e) {
    return { verifier: null, state: null }
  }
}

export function clearPKCE() {
  try {
    sessionStorage.removeItem('pkce_verifier')
    sessionStorage.removeItem('oauth_state')
  } catch (e) {}
}

// ===== 发起登录 =====

export async function startGithubLogin(clientId, clientSecret, redirectUri) {
  const cid = clientId || GITHUB_CLIENT_ID
  const csecret = clientSecret || GITHUB_CLIENT_SECRET
  const ruri = redirectUri || REDIRECT_URI

  if (!cid) {
    throw new Error('GitHub Client ID 未配置，请先在 GitHub 创建 OAuth App')
  }

  // 生成 PKCE 参数
  const verifier = generateRandomString(64)
  const challenge = base64urlEncode(await sha256(verifier))
  const state = generateRandomString(32)

  // 存储
  storePKCE(verifier, state)

  // 同时存储 clientSecret（callback 阶段需要）
  try {
    sessionStorage.setItem('gh_client_secret', csecret)
  } catch (e) {}

  // 构建授权 URL
  const authUrl = new URL('https://github.com/login/oauth/authorize')
  authUrl.searchParams.set('client_id', cid)
  authUrl.searchParams.set('redirect_uri', ruri)
  authUrl.searchParams.set('scope', 'read:user')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('code_challenge', challenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')

  window.location.href = authUrl.toString()
}

// ===== 处理回调（在 callback.html 中调用）=====

export async function handleCallback(urlParams) {
  const code = urlParams.get('code')
  const returnedState = urlParams.get('state')
  const error = urlParams.get('error')

  if (error) {
    return { error: error === 'access_denied' ? '用户取消了授权' : error }
  }

  if (!code) {
    return { error: '未收到授权码' }
  }

  // 取出存储的 PKCE 参数
  const { verifier, state: storedState } = getStoredPKCE()
  const secret = (() => { try { return sessionStorage.getItem('gh_client_secret') } catch(e){} return null })()

  if (!verifier) {
    return { error: 'PKCE 验证器丢失，请重新登录' }
  }

  if (storedState && storedState !== returnedState) {
    return { error: '状态验证失败（可能存在 CSRF 攻击）' }
  }

  if (!secret) {
    return { error: 'Client Secret 缺失' }
  }

  // 用 code + PKCE 换 access_token
  const tokenUrl = 'https://github.com/login/oauth/access_token'
  const body = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    client_secret: secret,
    code: code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier
  })

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  })

  const tokenData = await tokenRes.json()

  if (tokenData.error) {
    return { error: '获取 Token 失败: ' + (tokenData.error_description || tokenData.error) }
  }

  const accessToken = tokenData.access_token
  if (!accessToken) {
    return { error: '未获取到 access_token', data: tokenData }
  }

  // 获取用户信息
  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `token ${accessToken}`,
      'User-Agent': 'Mind-Explorer-App'
    }
  })
  const userData = await userRes.json()

  const userJson = JSON.stringify({
    token: accessToken,
    username: userData.login,
    avatar: userData.avatar_url,
    name: userData.name || userData.login
  })

  // 清理临时数据
  clearPKCE()
  try { sessionStorage.removeItem('gh_client_secret') } catch(e) {}

  return { user: userJson, userData }
}
