// Netlify Function: 处理 GitHub OAuth 登录（第一步：跳转授权）
exports.handler = async (event, context) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = `${process.env.URL || 'http://localhost:8000'}/.netlify/functions/auth-callback`;
  const scope = 'read:user,public_repo';

  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;

  return {
    statusCode: 302,
    headers: {
      Location: authUrl,
      'Cache-Control': 'no-cache'
    },
    body: ''
  };
};
