# 部署指南：启用 GitHub 登录

## 方案一：Netlify 部署（推荐，更安全）

### 步骤 1：创建 GitHub OAuth App

1. 打开 https://github.com/settings/developers
2. 点击 **New OAuth App**
3. 填写：
   - **Application name**: `心灵探索 Mind Explorer`
   - **Homepage URL**: `https://你的站点.netlify.app`
   - **Authorization callback URL**: `https://你的站点.netlify.app/.netlify/functions/auth-callback`
4. 点击 **Register application**
5. 复制 **Client ID**
6. 点击 **Generate a new client secret** 并复制（只显示一次！）

### 步骤 2：部署到 Netlify

#### 方法 A：通过 Netlify 网页界面

1. 打开 https://app.netlify.com
2. 点击 **Add new site** → **Import an existing project**
3. 选择 GitHub → 授权并选择 `kangkang-del/mind-explorer` 仓库
4. 配置构建设置：
   - **Build command**: `node node_modules/vite/bin/vite.js build`
   - **Publish directory**: `dist`
   - **Functions directory**: `netlify/functions`
5. 在 **Environment variables** 中添加：
   ```
   GITHUB_CLIENT_ID = 你的 Client ID
   GITHUB_CLIENT_SECRET = 你的 Client Secret
   ```
6. 点击 **Deploy site**

#### 方法 B：使用 Netlify CLI

```bash
# 安装 Netlify CLI
npm install -g netlify-cli

# 登录
netlify login

# 初始化项目（在 mind-explorer-vue 目录下）
cd mind-explorer-vue
netlify init

# 设置环境变量
netlify env:set GITHUB_CLIENT_ID "你的Client ID"
netlify env:set GITHUB_CLIENT_SECRET "你的Client Secret"

# 部署
netlify deploy --prod
```

### 步骤 3：验证登录

部署成功后访问你的 Netlify 域名，点击「GitHub 登录」，应该能正常跳转授权。

---

## 方案二：GitHub Pages + 纯前端 PKCE（无需服务器）

> ⚠️ 安全提示：此方案需要将 client_secret 暴露在前端代码中。对于开源学习项目可以接受，但不建议用于生产应用。

### 步骤 1：创建 GitHub OAuth App

同方案一的第 1 步，但 **Authorization callback URL** 改为：
```
https://kangkang-del.github.io/mind-explorer/callback.html
```

### 步骤 2：配置 Client ID 和 Secret

编辑以下两个文件，填入你的凭证：

#### 文件 1: `src/utils/githubOAuth.js`
```javascript
const GITHUB_CLIENT_ID = '你的 Client ID'
const GITHUB_CLIENT_SECRET = '你的 Client Secret'
```

#### 文件 2: `public/callback.html`
```javascript
var GITHUB_CLIENT_ID = '你的 Client ID'  // 底部的 <script> 标签内
```
> 注意：callback.html 里也需要设置 `GITHUB_CLIENT_ID`（client_secret 通过 sessionStorage 传递）

### 步骤 3：重新构建和部署

```bash
cd mind-explorer-vue
node node_modules/vite/bin/vite.js build

# 部署到 GitHub Pages
cd dist
git add -A
git commit -m "🚀 启用 GitHub OAuth"
git push origin main:gh-pages
```

### 步骤 4：测试登录

访问 https://kangkang-del.github.io/mind-explorer/ ，点击「GitHub 登录」：
1. 跳转到 GitHub 授权页面
2. 授权后自动回调到 `callback.html`
3. 自动换取 token、获取用户信息
4. 写入 cookie 后跳回首页，显示已登录状态

---

## 对比

| | 方案一 (Netlify) | 方案二 (GitHub Pages) |
|---|---|---|
| **安全性** | ✅ 高 (secret 存服务端) | ⚠️ 中 (secret 在前端) |
| **部署复杂度** | 中 (需 Netlify 账号) | 低 (已有 GitHub Pages) |
| **费用** | 免费 (100GB/月) | 免费 |
| **功能完整度** | ✅ 全部 Functions 可用 | 仅登录可用 |

---

## 当前状态

- [ ] 已创建 GitHub OAuth App
- [ ] 已获取 Client ID 和 Client Secret
- [ ] 已选择部署方案
- [ ] 已部署并验证登录功能
