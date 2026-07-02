// Netlify Function: 获取/更新用户积分
const https = require('https');

exports.handler = async (event, context) => {
  // 从 cookie 获取用户信息
  const cookies = event.headers.cookie || '';
  const userMatch = cookies.match(/me_user=([^;]+)/);
  
  if (!userMatch) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Not logged in' })
    };
  }

  let user;
  try {
    user = JSON.parse(Buffer.from(userMatch[1], 'base64').toString());
  } catch (e) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Invalid user cookie' })
    };
  }

  const token = user.token;
  const username = user.username;

  // 获取用户的积分 Issue（用 GitHub Issues 当数据库）
  // Issue 标题格式：[POINTS] username
  const repoOwner = process.env.GITHUB_REPO_OWNER || 'your-username';
  const repoName = process.env.GITHUB_REPO_NAME || 'mind-explorer';

  try {
    // 搜索积分 Issue
    const searchUrl = `https://api.github.com/search/issues?q=repo:${repoOwner}/${repoName}+title:[POINTS]+${username}+is:issue`;
    const searchResult = await fetch(searchUrl, {
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'Mind-Explorer-App',
        'Accept': 'application/vnd.github.v3+json'
      }
    }).then(res => res.json());

    let points = 0;
    let issueNumber = null;

    if (searchResult.total_count > 0) {
      const issue = searchResult.items[0];
      issueNumber = issue.number;
      // 从 Issue body 里解析积分
      const bodyMatch = issue.body.match(/points:\s*(\d+)/);
      if (bodyMatch) {
        points = parseInt(bodyMatch[1]);
      }
    }

    if (event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points, username })
      };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const delta = body.delta || 0;
      const newPoints = points + delta;

      const issueBody = `points: ${newPoints}\nusername: ${username}\nlast_update: ${new Date().toISOString()}`;

      if (issueNumber) {
        // 更新现有 Issue
        await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issueNumber}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `token ${token}`,
            'User-Agent': 'Mind-Explorer-App',
            'Accept': 'application/vnd.github.v3+json'
          },
          body: JSON.stringify({ body: issueBody })
        });
      } else {
        // 创建新 Issue
        await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/issues`, {
          method: 'POST',
          headers: {
            'Authorization': `token ${token}`,
            'User-Agent': 'Mind-Explorer-App',
            'Accept': 'application/vnd.github.v3+json'
          },
          body: JSON.stringify({
            title: `[POINTS] ${username}`,
            body: issueBody,
            labels: ['user-points']
          })
        });
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: newPoints, username })
      };
    }

    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error', message: error.message })
    };
  }
};
