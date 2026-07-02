// Netlify Function: 卡片互动（点赞 + 评论 + 审核）
// 点赞使用 GitHub Reactions API (heart)
// 评论使用 GitHub Issue Comments API
// 审核机制：评论加 [PENDING] 前缀，管理员审核通过后移除

const repoOwner = process.env.GITHUB_REPO_OWNER || 'kangkang-del';
const repoName = process.env.GITHUB_REPO_NAME || 'mind-explorer';
const repoToken = process.env.GITHUB_REPO_TOKEN || '';

const PENDING_PREFIX = '[PENDING]\n';

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

// 判断是否是管理员（仓库拥有者）
function isAdmin(user) {
  return user && user.username === repoOwner;
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
  return await fetch(url, options);
}

// 查找卡片的 Issue（标题格式：[CARD] {cardId}）
async function findCardIssue(cardId, token) {
  const searchUrl = `https://api.github.com/search/issues?q=repo:${repoOwner}/${repoName}+[CARD]+${cardId}+in:title+is:issue`;
  const res = await gh(searchUrl, 'GET', token);
  const data = await res.json();
  if (data.total_count > 0) {
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
    `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issueNumber}/comments?per_page=100`,
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

// 编辑评论（管理员用 repoToken）
async function editComment(commentId, body, token) {
  await gh(
    `https://api.github.com/repos/${repoOwner}/${repoName}/issues/comments/${commentId}`,
    'PATCH', token,
    { body }
  );
}

// 删除评论（管理员用 repoToken）
async function deleteCommentApi(commentId, token) {
  await gh(
    `https://api.github.com/repos/${repoOwner}/${repoName}/issues/comments/${commentId}`,
    'DELETE', token
  );
}

// 格式化评论列表（过滤待审核，管理员可见全部）
function formatComments(comments, admin) {
  return comments
    .map(c => {
      const isPending = c.body?.startsWith(PENDING_PREFIX);
      // 非管理员只返回已审核评论
      if (!admin && isPending) return null;
      return {
        id: c.id,
        author: c.user?.login || '匿名用户',
        avatar: c.user?.avatar_url || '',
        content: isPending ? c.body.slice(PENDING_PREFIX.length) : c.body,
        created_at: c.created_at,
        status: isPending ? 'pending' : 'approved'
      };
    })
    .filter(Boolean);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, body: '' };
  }

  const cardId = event.queryStringParameters?.card;
  if (!cardId) {
    return { statusCode: 400, body: JSON.stringify({ error: '缺少卡片ID' }) };
  }

  const user = parseUser(event);
  const admin = isAdmin(user);
  const token = user?.token || repoToken;

  if (!token) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ likes: 0, comments: [], liked: false, isAdmin: false })
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
          body: JSON.stringify({ likes: 0, comments: [], liked: false, isAdmin: admin })
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
          comments: formatComments(comments, admin),
          liked,
          isAdmin: admin
        })
      };
    }

    // ===== POST: 点赞/取消点赞/评论/审核 =====
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

      // 发表评论（加 [PENDING] 前缀等待审核）
      if (action === 'comment') {
        const content = (body.content || '').trim();
        if (!content) {
          return { statusCode: 400, body: JSON.stringify({ error: '评论不能为空' }) };
        }
        if (content.length > 2000) {
          return { statusCode: 400, body: JSON.stringify({ error: '评论不能超过2000字' }) };
        }
        // 管理员评论无需审核
        const commentBody = admin ? content : PENDING_PREFIX + content;
        await addComment(issue.number, commentBody, user.token);
        const comments = await getComments(issue.number, user.token);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            comments: formatComments(comments, admin),
            pending: !admin
          })
        };
      }

      // ===== 管理员操作 =====

      // 审核通过评论（移除 [PENDING] 前缀）
      if (action === 'approve-comment') {
        if (!admin) return { statusCode: 403, body: JSON.stringify({ error: '无权限' }) };
        if (!repoToken) return { statusCode: 500, body: JSON.stringify({ error: '服务器未配置 GITHUB_REPO_TOKEN' }) };
        const commentId = body.commentId;
        // 获取评论原文
        const commentRes = await gh(`https://api.github.com/repos/${repoOwner}/${repoName}/issues/comments/${commentId}`, 'GET', repoToken);
        const commentData = await commentRes.json();
        const originalBody = commentData.body || '';
        // 移除 [PENDING] 前缀
        const newBody = originalBody.startsWith(PENDING_PREFIX) ? originalBody.slice(PENDING_PREFIX.length) : originalBody;
        await editComment(commentId, newBody, repoToken);
        const comments = await getComments(issue.number, token);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comments: formatComments(comments, true) })
        };
      }

      // 删除评论
      if (action === 'delete-comment') {
        if (!admin) return { statusCode: 403, body: JSON.stringify({ error: '无权限' }) };
        if (!repoToken) return { statusCode: 500, body: JSON.stringify({ error: '服务器未配置 GITHUB_REPO_TOKEN' }) };
        const commentId = body.commentId;
        await deleteCommentApi(commentId, repoToken);
        const comments = await getComments(issue.number, token);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comments: formatComments(comments, true) })
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
