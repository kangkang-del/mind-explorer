// Netlify Function: 获取/更新用户贡献值
// 支持小数贡献值（如 0.1 点赞奖励）

// 获取贡献榜数据
async function fetchLeaderboard(token, repoOwner, repoName) {
  try {
    // 使用环境变量中的 token 或用户 token
    const searchToken = process.env.GITHUB_REPO_TOKEN || token;
    const effectiveOwner = repoOwner;
    const effectiveRepo = repoName;

    // 搜索所有 [POINTS] Issue
    const searchUrl = `https://api.github.com/search/issues?q=repo:${effectiveOwner}/${effectiveRepo}+[POINTS]+is:issue&per_page=30&sort=updated`;
    const res = await fetch(searchUrl, {
      headers: {
        'Authorization': `token ${searchToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Mind-Explorer-App'
      }
    });

    if (!res.ok) {
      return {
        statusCode: 200, // 不因为榜单加载失败阻断页面
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: '暂时无法加载排行榜', contributors: [] })
      };
    }

    const data = await res.json();

    // 解析所有用户的贡献值
    const contributors = (data.items || []).map(item => {
      const bodyText = item.body || '';
      const pointsMatch = bodyText.match(/points:\s*([\d.]+)/);
      const usernameMatch = bodyText.match(/username:\s*(\S+)/);
      return {
        username: usernameMatch ? usernameMatch[1] : item.title.replace('[POINTS]', '').trim(),
        avatar: item.user?.avatar_url || '',
        name: item.user?.login || '用户',
        points: pointsMatch ? parseFloat(pointsMatch[1]) : 0,
        updated: item.updated_at
      };
    })
    .filter(c => c.points > 0)
    .sort((a, b) => b.points - a.points);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contributors })
    };
  } catch (error) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message, contributors: [] })
    };
  }
}

exports.handler = async (event, context) => {
  // 从 cookie 获取用户信息
  const cookies = event.headers.cookie || '';
  const userMatch = cookies.match(/me_user=([^;]+)/);

  if (!userMatch) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Not logged in' })
    };
  }

  let user;
  try {
    user = JSON.parse(Buffer.from(userMatch[1], 'base64').toString());
  } catch (e) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid user cookie' })
    };
  }

  const token = user.token;
  const username = user.username;

  // 获取用户的贡献值 Issue（用 GitHub Issues 当数据库）
  // Issue 标题格式：[POINTS] username
  const repoOwner = process.env.GITHUB_REPO_OWNER || 'kangkang-del';
  const repoName = process.env.GITHUB_REPO_NAME || 'mind-explorer';

  try {
    // 搜索贡献值 Issue
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
      // 从 Issue body 里解析贡献值（支持小数）
      const bodyText = issue.body || '';
      const bodyMatch = bodyText.match(/points:\s*([\d.]+)/);
      if (bodyMatch) {
        points = parseFloat(bodyMatch[1]);
      }
    }

    if (event.httpMethod === 'GET') {
      // 支持 ?action=leaderboard 获取贡献榜
      const action = event.queryStringParameters?.action;

      if (action === 'leaderboard') {
        // 贡献榜：搜索所有 [POINTS] Issue，返回排行榜
        return await fetchLeaderboard(token, repoOwner, repoName);
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points, username })
      };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const delta = body.delta || 0;
      // 支持小数，保留1位精度
      const newPoints = Math.round((points + delta) * 10) / 10;

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error', message: error.message })
    };
  }
};
