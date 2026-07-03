// Netlify Function: 用户上传内容（文章 / 链接 / 图片）
// 文章和链接：创建 GitHub Issue 存储
// 图片：通过 Contents API 上传到仓库，再创建 Issue 引用

const repoOwner = process.env.GITHUB_REPO_OWNER || 'kangkang-del';
const repoName = process.env.GITHUB_REPO_NAME || 'mind-explorer';
const repoToken = process.env.GITHUB_REPO_TOKEN || '';

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

// 判断是否是管理员（仓库拥有者）
function isAdmin(user) {
  return user && user.username === repoOwner;
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

// 创建上传 Issue（带标签容错）
async function createUploadIssue(title, body, labels, token) {
  // 先尝试带标签创建
  let res = await gh(
    `https://api.github.com/repos/${repoOwner}/${repoName}/issues`,
    'POST', token,
    { title, body, labels }
  );
  // 标签不存在时（422），去掉标签重试
  if (!res.ok && res.status === 422) {
    res = await gh(
      `https://api.github.com/repos/${repoOwner}/${repoName}/issues`,
      'POST', token,
      { title, body }
    );
  }
  return await res.json();
}

// 上传图片文件到仓库（使用仓库拥有者的 Token）
async function uploadImageToRepo(filename, base64Content) {
  if (!repoToken) {
    throw new Error('服务器未配置 GITHUB_REPO_TOKEN，无法上传图片');
  }
  const path = `uploads/images/${Date.now()}-${filename.replace(/[^a-zA-Z0-9.\-]/g, '_')}`;
  const res = await gh(
    `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${path}`,
    'PUT', repoToken,
    {
      message: `Upload image: ${filename}`,
      content: base64Content
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `图片上传失败 (${res.status})`);
  }
  const data = await res.json();
  return data.content?.download_url || `https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/${path}`;
}

// 给用户增加贡献值（复用逻辑，支持小数）
async function addPointsToUser(username, token, delta) {
  const searchUrl = `https://api.github.com/search/issues?q=repo:${repoOwner}/${repoName}+title:[POINTS]+${username}+is:issue`;
  const searchRes = await gh(searchUrl, 'GET', token);
  const searchData = await searchRes.json();

  let points = 0;
  let issueNumber = null;

  if (searchData.total_count > 0) {
    const issue = searchData.items[0];
    issueNumber = issue.number;
    // 支持小数贡献值
    const bodyMatch = issue.body?.match(/points:\s*([\d.]+)/);
    if (bodyMatch) points = parseFloat(bodyMatch[1]);
  }

  // 保留1位小数精度
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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeadersBase, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return corsJsonResponse({ error: 'Method not allowed' }, 405);
  }

  const user = parseUser(event);
  if (!user) {
    return corsJsonResponse({ error: '请先登录' }, 401);
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const type = body.type;
    const now = new Date().toISOString();
    const admin = isAdmin(user);
    const pendingTag = admin ? '' : '[PENDING]';
    const pendingLabel = admin ? [] : ['pending'];

    // 公共元数据
    const meta = `author: ${user.username}\navatar: ${user.avatar}\nauthor_name: ${user.name || user.username}\ncreated_at: ${now}\n`;

    // ===== 文章上传 =====
    if (type === 'article') {
      const title = (body.title || '').trim();
      const content = (body.content || '').trim();
      const category = body.category || 'knowledge';

      if (!title || !content) {
        return corsJsonResponse({ error: '标题和内容不能为空' }, 400);
      }
      if (title.length > 100) {
        return corsJsonResponse({ error: '标题不能超过100字' }, 400);
      }

      const issueBody = `${meta}type: article\ntitle: ${title}\ncategory: ${category}\n\n---\n\n${content}`;
      const issue = await createUploadIssue(`[UPLOAD]${pendingTag}[article] ${title}`, issueBody, ['user-upload', 'article', ...pendingLabel], user.token);

      if (!issue.html_url) {
        return corsJsonResponse({ error: '创建失败，请重试' }, 500);
      }

      const points = await addPointsToUser(user.username, user.token, 5);

      return corsJsonResponse({ success: true, issueUrl: issue.html_url, points, pending: !admin }, 200);
    }

    // ===== 链接上传 =====
    if (type === 'link') {
      const title = (body.title || '').trim();
      const url = (body.url || '').trim();
      const description = (body.description || '').trim();

      if (!title || !url) {
        return corsJsonResponse({ error: '标题和链接不能为空' }, 400);
      }

      const issueBody = `${meta}type: link\ntitle: ${title}\nurl: ${url}\ndescription: ${description}\n\n---\n`;
      const issue = await createUploadIssue(`[UPLOAD]${pendingTag}[link] ${title}`, issueBody, ['user-upload', 'link', ...pendingLabel], user.token);

      if (!issue.html_url) {
        return corsJsonResponse({ error: '创建失败，请重试' }, 500);
      }

      const points = await addPointsToUser(user.username, user.token, 5);

      return corsJsonResponse({ success: true, issueUrl: issue.html_url, points, pending: !admin }, 200);
    }

    // ===== 图片上传 =====
    if (type === 'image') {
      const description = (body.description || '').trim();
      const imageBase64 = body.image;
      const filename = body.filename || 'image.jpg';

      if (!imageBase64) {
        return corsJsonResponse({ error: '请选择图片' }, 400);
      }

      // 上传图片文件到仓库
      const imageUrl = await uploadImageToRepo(filename, imageBase64);

      const issueBody = `${meta}type: image\ndescription: ${description || filename}\nimage_url: ${imageUrl}\n\n---\n`;
      const issue = await createUploadIssue(
        `[UPLOAD]${pendingTag}[image] ${description || filename}`,
        issueBody,
        ['user-upload', 'image', ...pendingLabel],
        user.token
      );

      if (!issue.html_url) {
        return corsJsonResponse({ error: '创建记录失败，但图片已上传' }, 500);
      }

      const points = await addPointsToUser(user.username, user.token, 5);

      return corsJsonResponse({ success: true, issueUrl: issue.html_url, imageUrl, points, pending: !admin }, 200);
    }

    return corsJsonResponse({ error: '无效的上传类型' }, 400);
  } catch (error) {
    console.error('Upload error:', error);
    return corsJsonResponse({ error: error.message || '服务器错误' }, 500);
  }
};
