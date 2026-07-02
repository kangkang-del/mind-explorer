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

    // Base64 编码后存到 cookie（简单方案，生产环境建议用加密）
    const encodedUser = Buffer.from(userJson).toString('base64');

    return {
      statusCode: 302,
      headers: {
        'Set-Cookie': `me_user=${encodedUser}; Path=/; Max-Age=2592000; SameSite=Lax`,
        'Cache-Control': 'no-cache',
        'Location': '/?login=success'
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
