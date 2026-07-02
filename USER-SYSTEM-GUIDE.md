# 心灵探索 — 用户系统部署指南

## 功能列表

✅ 用户登录/注册（GitHub OAuth）
✅ 用户积分系统
✅ 内容上传（文章/图片/链接）
✅ 积分排行榜
✅ 个人主页

---

## 部署步骤

### 第一步：在 GitHub 创建仓库

1. 打开 `https://github.com/new`
2. 仓库名：`mind-explorer`
3. 选择 **Public**
4. 点击 **Create repository**

### 第二步：上传网站文件到 GitHub

在本地（或者让 AI 帮你）把 `/workspace/mind-explorer/` 目录的所有文件推送到 GitHub 仓库。

### 第三步：注册 Netlify 并部署

1. 打开 `https://netlify.com`，用 GitHub 账号登录
2. **Add new site** → **Import an existing project** → **GitHub**
3. 选择 `mind-explorer` 仓库
4. Build settings：
   - Build command：留空
   - Publish directory：`.`
5. 点击 **Deploy**

部署完成后，你会得到一个免费域名：`https://xxx.netlify.app`

### 第四步：创建 GitHub OAuth App

1. 打开 `https://github.com/settings/developers`
2. 点击 **New OAuth App**
3. 填写：
   - Application name：`心灵探索`
   - Homepage URL：`https://你的网站名.netlify.app`
   - Authorization callback URL：`https://你的网站名.netlify.app/.netlify/functions/auth-callback`
4. 点击 **Register application**
5. 复制 **Client ID**
6. 点击 **Generate a new client secret**，复制 **Client Secret**

### 第五步：在 Netlify 配置环境变量

1. 进入 Netlify 网站控制台 → **Site settings** → **Environment variables**
2. 添加以下变量：
   - `GITHUB_CLIENT_ID` = 你的 Client ID
   - `GITHUB_CLIENT_SECRET` = 你的 Client Secret
   - `GITHUB_REPO_OWNER` = 你的 GitHub 用户名
   - `GITHUB_REPO_NAME` = `mind-explorer`

### 第六步：重新部署

在 Netlify 控制台点击 **Deploys** → **Trigger deploy** → **Clear cache and deploy site**

---

## 目录结构

```
mind-explorer/
├── index.html              # 首页（已改造，带登录按钮）
├── css/
│   └── style.css           # 样式（已加入用户系统样式）
├── js/
│   └── auth.js             # 登录系统核心 JS
├── user/
│   ├── profile.html        # 个人主页
│   ├── upload.html         # 上传内容页
│   └── points.html         # 积分排行榜
├── netlify/
│   └── functions/
│       ├── auth-login.js   # 登录跳转
│       ├── auth-callback.js # OAuth 回调处理
│       ├── auth-logout.js  # 登出
│       └── user-points.js  # 积分系统
└── netlify.toml            # Netlify 配置文件
```

---

## 测试登录

1. 打开你的网站 `https://xxx.netlify.app`
2. 点击右上角 **登录/注册**
3. 跳转到 GitHub 授权页面，点击 **Authorize**
4. 自动跳回网站，右上角显示你的 GitHub 头像和昵称

---

## 注意事项

- **Client Secret 保密**：不要提交到 GitHub 公开仓库，只存在 Netlify 环境变量里
- **免费额度**：Netlify Functions 每月 125,000 次免费调用，对个人网站足够
- **GitHub API 限制**：每小时 5000 次请求（已登录用户），足够用
- **国内访问**：Netlify 国内访问速度一般，但能访问；如果后期需要更快，可以迁移到腾讯云开发

---

## 下一步

部署完成后，可以告诉我，我帮你：
1. 把「点赞/认同」功能加到知识卡片页面
2. 把「评论」功能加到每个文章/卡片页面
3. 优化上传功能（真正存到 GitHub Issues）
