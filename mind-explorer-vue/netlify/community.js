// Netlify Function: 社区交流 - 获取/互动用户上传的内容
// 从 GitHub Issues 获取审核通过的上传内容，支持认同和评论

const repoOwner = process.env.GITHUB_REPO_OWNER || 'kangkang-del';
const repoName = process.env.GITHUB_REPO_NAME || 'mind-explorer';

// CORS Headers
const corsHeadersBase = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

const corsHeadersJson = {
  ...corsHeadersBase,
  'Content-Type': 'application/json'
};

function corsJsonResponse(body, statusCode = 200) {
  return {
    statusCode,
    headers: corsHeadersJson,
    body: typeof body === 'string' ? body : JSON.stringify(body)
  };
}

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

// 判断是否是管理员
function isAdmin(user) {
  return user && user.username === repoOwner;
}

// GitHub API 请求封装（支持 Reactions API）
async function gh(url, method, token, body, useReactionHeader = false) {
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

// 解析 Issue body 中的元数据
function parseIssueMeta(issueBody) {
  const meta = {};
  const lines = (issueBody || '').split('\n');
  let contentStarted = false;
  const contentLines = [];

  for (const line of lines) {
    if (line === '---') {
      contentStarted = true;
      continue;
    }
    if (!contentStarted) {
      const match = line.match(/^(\w[\w-]*):\s*(.+)$/);
      if (match) {
        meta[match[1].toLowerCase()] = match[2].trim();
      }
    } else {
      contentLines.push(line);
    }
  }

  meta.content = contentLines.join('\n').trim();
  return meta;
}

// GET: 获取社区内容列表
async function getCommunityPosts(token, currentUsername) {
  // 搜索所有非待审核的上传内容
  // 排除标题包含 [PENDING] 的 Issue
  const searchUrl = `https://api.github.com/search/issues?q=repo:${repoOwner}/${repoName}+[UPLOAD]+is:issue&sort=updated&per_page=20`;

  const res = await gh(searchUrl, 'GET', token);
  if (!res.ok) {
    throw new Error(`搜索失败: ${res.status}`);
  }
  const data = await res.json();

  // 过滤掉待审核和已拒绝的内容
  const approvedItems = data.items.filter(item =>
    !item.title.includes('[PENDING]') && !item.title.includes('[REJECTED]')
  );

  // 格式化返回数据（并发控制：分批获取，避免超时）
  const BATCH_SIZE = 5; // 每批5个帖子
  const posts = [];

  for (let i = 0; i < approvedItems.length; i += BATCH_SIZE) {
    const batch = approvedItems.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(async (item) => {
      try {
        return await formatPostItem(item, token, currentUsername);
      } catch (e) {
        console.error(`Failed to format post ${item.number}:`, e.message);
        // 单个帖子失败不影响整体
        return null;
      }
    }));
    posts.push(...batchResults.filter(Boolean));
  }

  return posts;
}

// 格式化单个帖子数据
async function formatPostItem(item, token, currentUsername) {
  const meta = parseIssueMeta(item.body);

  // 并发获取评论和 reactions
  const [commentsRes, reactionsRes] = await Promise.all([
    gh(
      `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${item.number}/comments`,
      'GET', token
    ),
    gh(
      `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${item.number}/reactions`,
      'GET', token, null, true
    )
  ]);

  const comments = commentsRes.ok ? await commentsRes.json() : [];
  const reactions = reactionsRes.ok ? await reactionsRes.json() : [];

    // 统计各类 reaction 数量
    const reactionCounts = {
      total: reactions.length,
      thumbsUp: reactions.filter(r => r.content === '+1').length,
      heart: reactions.filter(r => r.content === 'heart').length,
      eyes: reactions.filter(r => r.content === 'eyes').length
    };

    // 检查当前用户是否已反应（需要传入用户名）
    const userReacted = currentUsername
      ? reactions.some(r => r.user && r.user.login === currentUsername)
      : false;

    return {
      id: item.id,
      number: item.number,
      type: meta.type || 'article', // article, image, link, video, file
      title: item.title.replace(/\[UPLOAD\](\[\w+\])?\s*/, '').trim(),
      author: meta.author || item.user?.login || '匿名用户',
      avatar: meta.avatar || item.user?.avatar_url || '',
      author_name: meta.author_name || meta.author || item.user?.login || '匿名用户',
      created_at: meta.created_at || item.created_at,
      updated_at: item.updated_at,
      category: meta.category || 'knowledge',
      description: meta.description || meta.title || '',
      content: meta.content || meta.description || '',
      image_url: meta.image_b64 ? `data:image/jpeg;base64,${meta.image_b64}` : (meta.image_url || ''),
      url: meta.url || '',
      issue_url: item.html_url,
      comments_count: comments.length,
      reactions: reactionCounts,
      user_reacted: userReacted,  // 返回给前端，用于初始化按钮状态
      // 评论列表（格式化）
      comments: comments.map(c => ({
        id: c.id,
        idStr: String(c.id),
        author: c.user?.login || '匿名用户',
        avatar: c.user?.avatar_url || '',
        content: c.body,
        created_at: c.created_at
      }))
    };
}

// POST: 对社区内容进行操作（认同/评论）
async function interactWithPost(token, user, actionData) {
  const { action, postNumber, commentId, content } = actionData;

  // ===== 认同/取消认同（Reactions API）=====
  if (action === 'react' || action === 'unreact') {
    const reactionType = content || '+1'; // +1, -1, laugh, confused, heart, hooray, eyes, rocket

    if (action === 'react') {
      // 添加 reaction
      const res = await gh(
        `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${postNumber}/reactions`,
        'POST', token, { content: reactionType }, true
      );
      // GitHub Reactions API: 201 创建成功， 200 表示已存在（幂等处理）
      if (!res.ok && res.status !== 201 && res.status !== 200) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `添加认同失败 (${res.status})`);
      }
      return { success: true, message: '已添加认同' };
    } else {
      // 删除 reaction（需要获取用户的 reaction ID）
      const reactionsRes = await gh(
        `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${postNumber}/reactions`,
        'GET', token, null, true
      );
      if (!reactionsRes.ok) throw new Error('获取认同列表失败');
      const reactions = await reactionsRes.json();

      // 找到当前用户的 reaction
      const userReaction = reactions.find(r => r.user?.login === user.username);
      if (!userReaction) {
        throw new Error('未找到您的认同记录');
      }

      // GitHub Reactions API: 删除需要 /issues/{issue_number}/reactions/{reaction_id}
      const deleteRes = await gh(
        `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${postNumber}/reactions/${userReaction.id}`,
        'DELETE', token, null, true
      );
      if (!deleteRes.ok && deleteRes.status !== 204) {
        throw new Error('取消认同失败');
      }
      return { success: true, message: '已取消认同' };
    }
  }

  // ===== 发表评论 =====
  if (action === 'comment') {
    if (!content || !content.trim()) {
      throw new Error('评论内容不能为空');
    }

    // 非管理员评论添加 [PENDING] 前缀等待审核
    const admin = isAdmin(user);
    const commentBody = admin ? content.trim() : '[PENDING]\n' + content.trim();

    const res = await gh(
      `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${postNumber}/comments`,
      'POST', token, { body: commentBody }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || '发表评论失败');
    }
    const comment = await res.json();
    return {
      success: true,
      message: admin ? '评论发布成功' : '评论已提交，等待审核',
      pending: !admin,
      comment: {
        id: comment.id,
        idStr: String(comment.id),
        author: comment.user?.login,
        avatar: comment.user?.avatar_url,
        content: content.trim(),
        created_at: comment.created_at
      }
    };
  }

  // ===== 管理员：审核通过/拒绝 =====
  if (action === 'approve' || action === 'reject') {
    if (!isAdmin(user)) {
      throw new Error('无权限执行此操作');
    }

    const issueRes = await gh(
      `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${postNumber}`,
      'GET', token
    );
    if (!issueRes.ok) throw new Error('Issue 不存在');

    const issue = await issueRes.json();
    let newTitle = issue.title;

    if (action === 'approve') {
      // 移除 [PENDING] 前缀
      newTitle = newTitle.replace(/\[PENDING\]/g, '');
    } else {
      // 添加 [REJECTED]
      if (!newTitle.includes('[REJECTED]')) {
        newTitle = '[REJECTED]' + newTitle.replace(/\[PENDING\]/g, '');
      }
    }

    const updateRes = await gh(
      `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${postNumber}`,
      'PATCH', token, { title: newTitle.trim() }
    );

    if (!updateRes.ok) throw new Error('更新状态失败');
    return { success: true, message: action === 'approve' ? '已审核通过' : '已拒绝' };
  }

  throw new Error('无效的操作类型');
}

// 主处理函数
exports.handler = async (event) => {
  // CORS 预检请求
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeadersBase, body: '' };
  }

  // GET 请求：获取社区内容列表
  if (event.httpMethod === 'GET') {
    try {
      const user = parseUser(event);
      // 社区内容可以公开浏览，但登录后可以看到更多详情
      // 使用公开 token 或用户 token
      const token = user?.token || process.env.GITHUB_REPO_TOKEN || '';
      const currentUsername = user?.username || null;

      const posts = await getCommunityPosts(token, currentUsername);
      return corsJsonResponse({ success: true, posts });
    } catch (error) {
      console.error('Community GET error:', error);
      return corsJsonResponse({ error: error.message || '获取社区内容失败' }, 500);
    }
  }

  // POST 请求：互动操作（需要登录）
  if (event.httpMethod === 'POST') {
    const user = parseUser(event);
    if (!user) {
      return corsJsonResponse({ error: '请先登录' }, 401);
    }

    try {
      const body = JSON.parse(event.body || '{}');
      const result = await interactWithPost(user.token, user, body);
      return corsJsonResponse(result);
    } catch (error) {
      console.error('Community POST error:', error);
      return corsJsonResponse({ error: error.message || '操作失败' }, 500);
    }
  }

  return corsJsonResponse({ error: 'Method not allowed' }, 405);
};
