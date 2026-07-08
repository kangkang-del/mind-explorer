// Netlify Function: 处理 GitHub OAuth 回调（用 code 换 access_token）
const https = require('https');

exports.handler = async (event, context) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const redirectUri = `${process.env.URL || 'http://localhost:8000'}/.netlify/functions/auth-callback`;

  const code = event.queryStringParameters.code;

  if (!code) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'No code provided' })
    };
  }

  // 用 code 换 access_token
  const tokenUrl = `https://github.com/login/oauth/access_token?client_id=${clientId}&client_secret=${clientSecret}&code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  try {
    // 获取 access_token
    const tokenData = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json'
      }
    }).then(res => res.json());

    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Failed to get access token', data: tokenData })
      };
    }

    // 获取用户信息
    const userData = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${accessToken}`,
        'User-Agent': 'Mind-Explorer-App'
      }
    }).then(res => res.json());

    // 把 token 和用户信息存到 cookie，然后跳转回首页
    const userJson = JSON.stringify({
      token: accessToken,
      username: userData.login,
      avatar: userData.avatar_url,
      name: userData.name || userData.login
    });

    // Base64 编码后存到 cookie
    const encodedUser = Buffer.from(userJson).toString('base64');
    // 注意: Netlify HTTPS 环境下自动启用 Secure; HttpOnly 会导致前端 JS 无法读取用户信息
    // 因此保留 JS 可读性（前端 Auth.getUser 依赖 cookie），使用 SameSite=Lax 防 CSRF
    const isSecure = process.env.URL && process.env.URL.startsWith('https');
    return {
      statusCode: 302,
      headers: {
        'Set-Cookie': `me_user=${encodedUser}; Path=/; Max-Age=2592000; SameSite=Lax${isSecure ? '; Secure' : ''}`,
        'Cache-Control': 'no-cache',
        'Location': '/mind-explorer/?login=success'
      },
      body: ''
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error', message: error.message })
    };
  }
};
