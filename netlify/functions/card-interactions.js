// Netlify Function: 卡片互动（点赞 + 评论 + 审核）
// 点赞使用 GitHub Reactions API (heart)
// 评论使用 GitHub Issue Comments API
// 审核机制：评论加 [PENDING] 前缀，管理员审核通过后移除

const repoOwner = process.env.GITHUB_REPO_OWNER || 'kangkang-del';
const repoName = process.env.GITHUB_REPO_NAME || 'mind-explorer';
const repoToken = process.env.GITHUB_REPO_TOKEN || '';

const PENDING_PREFIX = '[PENDING]\n';

// CORS Headers（基础）
const corsHeadersBase = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

// 带 JSON 的 CORS Headers
const corsHeadersJson = {
  ...corsHeadersBase,
  'Content-Type': 'application/json'
};

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
async function gh(url, method, token, body, useReactionHeader = false) {
  // Reactions API 需要特殊的 Accept header
  const acceptHeader = useReactionHeader 
    ? 'application/vnd.github.symmetrica-preview+json'
    : 'application/vnd.github.v3+json';
  
  const headers = {
    'Authorization': `token ${token}`,
    'User-Agent': 'Mind-Explorer-App',
    'Accept': acceptHeader
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
    return data.items.find(i => i.title === `[CARD] ${cardId}`) || null;
  }
  return null;
}

// 创建卡片的讨论 Issue
async function createCardIssue(cardId, token) {
  const res = await gh(
    `https://api.github.com/repos/${repoOwner}/${repoName}/issues`,
    'POST', token,
    { 
      title: `[CARD] ${cardId}`, 
      body: `知识卡片 #${cardId} 的讨论区\n\n欢迎在此讨论与这张知识卡片相关的内容。` 
    }
  );
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error('Failed to create card issue:', res.status, errorText);
    throw new Error(`创建卡片讨论区失败: ${res.status}`);
  }
  
  return await res.json();
}

// 获取 Issue 的所有 reactions（使用特殊的 Accept header）
async function getReactions(issueNumber, token) {
  const res = await gh(
    `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issueNumber}/reactions?per_page=100`,
    'GET', token,
    null,
    true // 标记为 Reactions API
  );
  if (!res.ok) {
    console.error('Failed to get reactions:', res.status, await res.text());
    return [];
  }
  return await res.json();
}

// 添加 reaction（使用特殊的 Accept header）
async function addReaction(issueNumber, content, token) {
  const res = await gh(
    `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issueNumber}/reactions`,
    'POST', token,
    { content },
    true // 标记为 Reactions API
  );
  if (!res.ok) {
    const err = await res.text();
    console.error('Failed to add reaction:', res.status, err);
    throw new Error(`添加点赞失败: ${res.status}`);
  }
  return res;
}

// 删除 reaction（使用特殊的 Accept header）
async function deleteReaction(issueNumber, reactionId, token) {
  const res = await gh(
    `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issueNumber}/reactions/${reactionId}`,
    'DELETE', token,
    null,
    true // 标记为 Reactions API
  );
  // DELETE 请求没有响应体，但状态码应该是 204
  if (!res.ok && res.status !== 204) {
    const err = await res.text();
    console.error('Failed to delete reaction:', res.status, err);
  }
}

// 获取 Issue 评论
async function getComments(issueNumber, token) {
  const res = await gh(
    `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issueNumber}/comments?per_page=100`,
    'GET', token
  );
  if (!res.ok) {
    console.error('Failed to get comments:', res.status, await res.text());
    return [];
  }
  return await res.json();
}

// 添加评论
async function addComment(issueNumber, body, token) {
  const res = await gh(
    `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issueNumber}/comments`,
    'POST', token,
    { body }
  );
  if (!res.ok) {
    const err = await res.text();
    console.error('Failed to add comment:', res.status, err);
    throw new Error(`添加评论失败: ${res.status}`);
  }
  return await res.json();
}

// 编辑评论（管理员用 repoToken）
async function editComment(commentId, body, token) {
  const res = await gh(
    `https://api.github.com/repos/${repoOwner}/${repoName}/issues/comments/${commentId}`,
    'PATCH', token,
    { body }
  );
  if (!res.ok) {
    const err = await res.text();
    console.error('Failed to edit comment:', res.status, err);
    throw new Error(`编辑评论失败: ${res.status}`);
  }
  return await res.json();
}

// 删除评论（管理员用 repoToken）
async function deleteCommentApi(commentId, token) {
  const res = await gh(
    `https://api.github.com/repos/${repoOwner}/${repoName}/issues/comments/${commentId}`,
    'DELETE', token
  );
  if (!res.ok && res.status !== 204) {
    const err = await res.text();
    console.error('Failed to delete comment:', res.status, err);
    throw new Error(`删除评论失败: ${res.status}`);
  }
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
        idStr: String(c.id),  // 转为字符串，避免浮点数问题
        author: c.user?.login || '匿名用户',
        avatar: c.user?.avatar_url || '',
        content: isPending ? c.body.slice(PENDING_PREFIX.length) : c.body,
        created_at: c.created_at,
        status: isPending ? 'pending' : 'approved'
      };
    })
    .filter(Boolean);
}

// 给用户增加贡献值（点赞知识卡片 +0.1）
async function addContributionPoints(username, token, delta) {
  const searchUrl = `https://api.github.com/search/issues?q=repo:${repoOwner}/${repoName}+title:[POINTS]+${username}+is:issue`;
  const searchRes = await gh(searchUrl, 'GET', token);
  const searchData = await searchRes.json();

  let points = 0;
  let issueNumber = null;

  if (searchData.total_count > 0) {
    const issue = searchData.items[0];
    issueNumber = issue.number;
    const bodyMatch = issue.body?.match(/points:\s*([\d.]+)/);
    if (bodyMatch) points = parseFloat(bodyMatch[1]);
  }

  // 支持小数贡献值（保留1位小数）
  const newPoints = Math.round((points + delta) * 10) / 10;
  const issueBody = `points: ${newPoints}\nusername: ${username}\nlast_update: ${new Date().toISOString()}`;

  if (issueNumber) {
    await gh(`https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issueNumber}`, 'PATCH', token, { body: issueBody });
  } else {
    await gh(`https://api.github.com/repos/${repoOwner}/${repoName}/issues`, 'POST', token, {
      title: `[POINTS] ${username}`,
      body: issueBody,
      labels: ['user-points']
    });
  }

  return newPoints;
}

// 构建带 CORS 的 JSON 响应
function corsJsonResponse(body, statusCode = 200) {
  return {
    statusCode,
    headers: corsHeadersJson,
    body: JSON.stringify(body)
  };
}

// 构建 CORS 的空响应（用于 OPTIONS）
function corsEmptyResponse() {
  return {
    statusCode: 200,
    headers: corsHeadersBase,
    body: ''
  };
}

exports.handler = async (event) => {
  // 处理 CORS 预检请求
  if (event.httpMethod === 'OPTIONS') {
    return corsEmptyResponse();
  }

  const cardId = event.queryStringParameters?.card;
  if (!cardId) {
    return corsJsonResponse({ error: '缺少卡片ID' }, 400);
  }

  const user = parseUser(event);
  const admin = isAdmin(user);
  const token = user?.token || repoToken;

  if (!token) {
    console.log('No token available, returning empty data');
    return corsJsonResponse({ likes: 0, comments: [], liked: false, isAdmin: false });
  }

  try {
    // ===== GET: 获取点赞数和评论 =====
    if (event.httpMethod === 'GET') {
      console.log('GET request for card:', cardId, 'user:', user?.username);
      
      const issue = await findCardIssue(cardId, token);
      if (!issue) {
        console.log('No issue found for card:', cardId);
        return corsJsonResponse({ likes: 0, comments: [], liked: false, isAdmin: admin });
      }

      console.log('Found issue:', issue.number);

      const reactions = await getReactions(issue.number, token);
      const hearts = reactions.filter(r => r.content === 'heart');
      const liked = user ? hearts.some(r => r.user?.login === user.username) : false;

      const comments = await getComments(issue.number, token);
      
      console.log('Reactions:', hearts.length, 'Comments:', comments.length);

      return corsJsonResponse({
        likes: hearts.length,
        comments: formatComments(comments, admin),
        liked,
        isAdmin: admin
      });
    }

    // ===== POST: 点赞/取消点赞/评论/审核 =====
    if (event.httpMethod === 'POST') {
      if (!user) {
        return corsJsonResponse({ error: '请先登录' }, 401);
      }

      let body;
      try {
        body = JSON.parse(event.body || '{}');
      } catch (e) {
        return corsJsonResponse({ error: '无效的请求数据' }, 400);
      }
      
      const action = body.action;

      // 查找或创建卡片 Issue
      let issue = await findCardIssue(cardId, user.token);
      if (!issue) {
        console.log('Creating new issue for card:', cardId);
        issue = await createCardIssue(cardId, user.token);
        console.log('Created issue:', issue.number);
      }

      // 点赞（+0.1 贡献值）
      if (action === 'like') {
        console.log('Like action for card:', cardId, 'user:', user.username);

        const reactions = await getReactions(issue.number, user.token);
        const existing = reactions.find(r => r.content === 'heart' && r.user?.login === user.username);

        if (!existing) {
          await addReaction(issue.number, 'heart', user.token);
          // 增加贡献值
          try {
            await addContributionPoints(user.username, user.token, 0.1);
            console.log('Added 0.1 contribution points for:', user.username);
          } catch (e) {
            console.warn('Failed to add contribution points:', e.message);
            // 贡献值增加失败不影响点赞功能
          }
        } else {
          console.log('User already liked this card');
        }

        const updated = await getReactions(issue.number, user.token);
        const heartCount = updated.filter(r => r.content === 'heart').length;

        return corsJsonResponse({ likes: heartCount, liked: true });
      }

      // 取消点赞
      if (action === 'unlike') {
        console.log('Unlike action for card:', cardId, 'user:', user.username);
        
        const reactions = await getReactions(issue.number, user.token);
        const existing = reactions.find(r => r.content === 'heart' && r.user?.login === user.username);
        
        if (existing) {
          await deleteReaction(issue.number, existing.id, user.token);
        }
        
        const updated = await getReactions(issue.number, user.token);
        const heartCount = updated.filter(r => r.content === 'heart').length;
        
        return corsJsonResponse({ likes: heartCount, liked: false });
      }

      // 发表评论（加 [PENDING] 前缀等待审核）
      if (action === 'comment') {
        const content = (body.content || '').trim();
        if (!content) {
          return corsJsonResponse({ error: '评论不能为空' }, 400);
        }
        if (content.length > 2000) {
          return corsJsonResponse({ error: '评论不能超过2000字' }, 400);
        }
        
        // 管理员评论无需审核
        const commentBody = admin ? content : PENDING_PREFIX + content;
        await addComment(issue.number, commentBody, user.token);
        
        const comments = await getComments(issue.number, user.token);
        return corsJsonResponse({
          comments: formatComments(comments, admin),
          pending: !admin
        });
      }

      // ===== 管理员操作 =====

      // 审核通过评论（移除 [PENDING] 前缀）
      if (action === 'approve-comment') {
        if (!admin) return corsJsonResponse({ error: '无权限' }, 403);
        if (!repoToken) return corsJsonResponse({ error: '服务器未配置 GITHUB_REPO_TOKEN' }, 500);
        
        const commentId = body.commentId;
        // 获取评论原文
        const commentRes = await gh(`https://api.github.com/repos/${repoOwner}/${repoName}/issues/comments/${commentId}`, 'GET', repoToken);
        
        if (!commentRes.ok) {
          return corsJsonResponse({ error: '无法获取评论' }, 400);
        }
        
        const commentData = await commentRes.json();
        const originalBody = commentData.body || '';
        // 移除 [PENDING] 前缀
        const newBody = originalBody.startsWith(PENDING_PREFIX) ? originalBody.slice(PENDING_PREFIX.length) : originalBody;
        await editComment(commentId, newBody, repoToken);
        
        const comments = await getComments(issue.number, token);
        return corsJsonResponse({ comments: formatComments(comments, true) });
      }

      // 删除评论
      if (action === 'delete-comment') {
        if (!admin) return corsJsonResponse({ error: '无权限' }, 403);
        if (!repoToken) return corsJsonResponse({ error: '服务器未配置 GITHUB_REPO_TOKEN' }, 500);
        
        const commentId = body.commentId;
        await deleteCommentApi(commentId, repoToken);
        
        const comments = await getComments(issue.number, token);
        return corsJsonResponse({ comments: formatComments(comments, true) });
      }

      return corsJsonResponse({ error: '无效的操作' }, 400);
    }

    return corsJsonResponse({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('Card interactions error:', error);
    return corsJsonResponse({ error: '服务器错误', message: error.message }, 500);
  }
};
