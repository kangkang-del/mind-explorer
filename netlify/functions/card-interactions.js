// Netlify Function: 卡片互动（点赞 + 评论）
// 点赞使用 GitHub Reactions API (heart)
// 评论使用 GitHub Issue Comments API

const repoOwner = process.env.GITHUB_REPO_OWNER || 'kangkang-del';
const repoName = process.env.GITHUB_REPO_NAME || 'mind-explorer';
const repoToken = process.env.GITHUB_REPO_TOKEN || '';

// 从 cookie 解析用户信息
function parseUser(event) {
  const cookies = event.headers.cookie || '';
  const userMatch = cookies.match(/me_user=([^;]+)/);
  if (!userMatch) return null;
  try {
    return JSON.parse(Buffer.from(userMatch[1], 'base64').toString());
  } catch (e) {
    return null;
  }
}

// GitHub API 请求封装
async function gh(url, method, token, body) {
  const headers = {
    'Authorization': `token ${token}`,
    'User-Agent': 'Mind-Explorer-App',
    'Accept': 'application/vnd.github.v3+json'
  };
  const options = { method: method || 'GET', headers };
  if (body) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  return res;
}

// 查找卡片的 Issue（标题格式：[CARD] {cardId}）
async function findCardIssue(cardId, token) {
  const searchUrl = `https://api.github.com/search/issues?q=repo:${repoOwner}/${repoName}+[CARD]+${cardId}+in:title+is:issue`;
  const res = await gh(searchUrl, 'GET', token);
  const data = await res.json();
  if (data.total_count > 0) {
    // 精确匹配标题，避免 [CARD] 1 匹配到 [CARD] 10
    return data.items.find(i => i.title === `[CARD] ${cardId}`) || null;
  }
  return null;
}

// 创建卡片的讨论 Issue
async function createCardIssue(cardId, token) {
  const res = await gh(
    `https://api.github.com/repos/${repoOwner}/${repoName}/issues`,
    'POST', token,
    { title: `[CARD] ${cardId}`, body: `知识卡片 #${cardId} 的讨论区\n\n欢迎在此讨论与这张知识卡片相关的内容。` }
  );
  return await res.json();
}

// 获取 Issue 的所有 reactions
async function getReactions(issueNumber, token) {
  const res = await gh(
    `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issueNumber}/reactions?per_page=100`,
    'GET', token
  );
  if (!res.ok) return [];
  return await res.json();
}

// 添加 reaction
async function addReaction(issueNumber, content, token) {
  await gh(
    `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issueNumber}/reactions`,
    'POST', token,
    { content }
  );
}

// 删除 reaction
async function deleteReaction(issueNumber, reactionId, token) {
  await gh(
    `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issueNumber}/reactions/${reactionId}`,
    'DELETE', token
  );
}

// 获取 Issue 评论
async function getComments(issueNumber, token) {
  const res = await gh(
    `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issueNumber}/comments?per_page=50`,
    'GET', token
  );
  if (!res.ok) return [];
  return await res.json();
}

// 添加评论
async function addComment(issueNumber, body, token) {
  await gh(
    `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issueNumber}/comments`,
    'POST', token,
    { body }
  );
}

// 格式化评论列表
function formatComments(comments) {
  return comments.map(c => ({
    id: c.id,
    author: c.user?.login || '匿名用户',
    avatar: c.user?.avatar_url || '',
    content: c.body,
    created_at: c.created_at
  }));
}

exports.handler = async (event) => {
  // CORS 预检
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, body: '' };
  }

  const cardId = event.queryStringParameters?.card;
  if (!cardId) {
    return { statusCode: 400, body: JSON.stringify({ error: '缺少卡片ID' }) };
  }

  const user = parseUser(event);
  const token = user?.token || repoToken;

  // 没有任何 token 时返回空数据
  if (!token) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ likes: 0, comments: [], liked: false })
    };
  }

  try {
    // ===== GET: 获取点赞数和评论 =====
    if (event.httpMethod === 'GET') {
      const issue = await findCardIssue(cardId, token);
      if (!issue) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ likes: 0, comments: [], liked: false })
        };
      }

      const reactions = await getReactions(issue.number, token);
      const hearts = reactions.filter(r => r.content === 'heart');
      const liked = user ? hearts.some(r => r.user?.login === user.username) : false;

      const comments = await getComments(issue.number, token);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          likes: hearts.length,
          comments: formatComments(comments),
          liked
        })
      };
    }

    // ===== POST: 点赞/取消点赞/评论 =====
    if (event.httpMethod === 'POST') {
      if (!user) {
        return { statusCode: 401, body: JSON.stringify({ error: '请先登录' }) };
      }

      const body = JSON.parse(event.body || '{}');
      const action = body.action;

      // 查找或创建卡片 Issue
      let issue = await findCardIssue(cardId, user.token);
      if (!issue) {
        issue = await createCardIssue(cardId, user.token);
      }

      // 点赞
      if (action === 'like') {
        const reactions = await getReactions(issue.number, user.token);
        const existing = reactions.find(r => r.content === 'heart' && r.user?.login === user.username);
        if (!existing) {
          await addReaction(issue.number, 'heart', user.token);
        }
        const updated = await getReactions(issue.number, user.token);
        const heartCount = updated.filter(r => r.content === 'heart').length;
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ likes: heartCount, liked: true })
        };
      }

      // 取消点赞
      if (action === 'unlike') {
        const reactions = await getReactions(issue.number, user.token);
        const existing = reactions.find(r => r.content === 'heart' && r.user?.login === user.username);
        if (existing) {
          await deleteReaction(issue.number, existing.id, user.token);
        }
        const updated = await getReactions(issue.number, user.token);
        const heartCount = updated.filter(r => r.content === 'heart').length;
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ likes: heartCount, liked: false })
        };
      }

      // 发表评论
      if (action === 'comment') {
        const content = (body.content || '').trim();
        if (!content) {
          return { statusCode: 400, body: JSON.stringify({ error: '评论不能为空' }) };
        }
        if (content.length > 2000) {
          return { statusCode: 400, body: JSON.stringify({ error: '评论不能超过2000字' }) };
        }
        await addComment(issue.number, content, user.token);
        const comments = await getComments(issue.number, user.token);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comments: formatComments(comments) })
        };
      }

      return { statusCode: 400, body: JSON.stringify({ error: '无效的操作' }) };
    }

    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (error) {
    console.error('Card interactions error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: '服务器错误', message: error.message })
    };
  }
};
