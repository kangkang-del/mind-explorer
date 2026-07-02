// Netlify Function: 管理员审核（上传内容审核 + 评论统计）
// 仅管理员（仓库拥有者）可用

const repoOwner = process.env.GITHUB_REPO_OWNER || 'kangkang-del';
const repoName = process.env.GITHUB_REPO_NAME || 'mind-explorer';
const repoToken = process.env.GITHUB_REPO_TOKEN || '';

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

function isAdmin(user) {
  return user && user.username === repoOwner;
}

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

// 搜索待审核上传（带 pending 标签的 Issue）
async function getPendingUploads(token) {
  const searchUrl = `https://api.github.com/search/issues?q=repo:${repoOwner}/${repoName}+label:pending+is:open&sort=created&order=desc&per_page=30`;
  const res = await gh(searchUrl, 'GET', token);
  if (!res.ok) return [];
  const data = await res.json();
  return data.items || [];
}

// 解析上传 Issue 的结构化数据
function parseUploadIssue(issue) {
  const body = issue.body || '';
  const lines = body.split('\n');
  const meta = {};
  let contentStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === '---') { contentStart = i + 1; break; }
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) meta[match[1]] = match[2];
  }

  // 提取标题（去掉 [UPLOAD][PENDING][type] 前缀）
  const titleMatch = issue.title.match(/^\[UPLOAD\](?:\[PENDING\])?\[(\w+)\]\s*(.*)$/);
  const type = titleMatch ? titleMatch[1] : 'unknown';
  const title = titleMatch ? titleMatch[2] : issue.title;

  return {
    number: issue.number,
    type,
    title,
    author: meta.author || '未知',
    author_name: meta.author_name || meta.author || '未知',
    avatar: meta.avatar || '',
    url: meta.url || '',
    image_url: meta.image_url || '',
    description: meta.description || '',
    category: meta.category || '',
    content: lines.slice(contentStart).join('\n').trim(),
    issueUrl: issue.html_url,
    created_at: issue.created_at
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, body: '' };
  }

  const user = parseUser(event);
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: '请先登录' }) };
  }
  if (!isAdmin(user)) {
    return { statusCode: 403, body: JSON.stringify({ error: '无管理员权限' }) };
  }

  const token = repoToken || user.token;

  try {
    // ===== GET: 获取待审核列表 =====
    if (event.httpMethod === 'GET') {
      const pendingIssues = await getPendingUploads(token);
      const uploads = pendingIssues.map(parseUploadIssue);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pendingCount: uploads.length,
          uploads
        })
      };
    }

    // ===== POST: 审核操作 =====
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const action = body.action;
      const issueNumber = body.issueNumber;

      if (!issueNumber) {
        return { statusCode: 400, body: JSON.stringify({ error: '缺少 Issue 编号' }) };
      }

      // 审核通过：移除 [PENDING] 标记，移除 pending 标签
      if (action === 'approve') {
        // 先获取 Issue 信息
        const issueRes = await gh(`https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issueNumber}`, 'GET', token);
        const issueData = await issueRes.json();

        // 移除标题中的 [PENDING]
        const newTitle = issueData.title.replace('[PENDING]', '');

        // 更新标题和标签（移除 pending）
        await gh(`https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issueNumber}`, 'PATCH', token, {
          title: newTitle,
          labels: ['user-upload', 'approved']
        });

        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: true, message: '审核通过' })
        };
      }

      // 审核拒绝：关闭 Issue
      if (action === 'reject') {
        // 添加拒绝评论
        await gh(`https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issueNumber}/comments`, 'POST', token, {
          body: '❌ 管理员已拒绝此上传内容。'
        });
        // 关闭 Issue
        await gh(`https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issueNumber}`, 'PATCH', token, {
          state: 'closed'
        });

        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: true, message: '已拒绝' })
        };
      }

      return { statusCode: 400, body: JSON.stringify({ error: '无效的操作' }) };
    }

    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (error) {
    console.error('Admin review error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: '服务器错误', message: error.message })
    };
  }
};
