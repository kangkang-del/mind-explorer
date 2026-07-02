# 心灵探索 (Mind Explorer) — 项目笔记

> 本文件用于记录项目的所有关键信息，确保每次新任务都能快速接上。

## 📌 项目概览

| 项目 | 详情 |
|------|------|
| **网站名称** | 心灵探索（Mind Explorer） |
| **定位** | 心理学知识学习系统（静态站点 + 用户系统） |
| **内容规模** | 96张知识卡片 · 20种心理疾病科普 · 16位心理学家 · 18个经典实验 · 136个HTML页面 |
| **负责人** | 江江德 |
| **技术能力** | 主要依赖 AI 辅助编写代码 |

## 🔗 关键链接

| 链接 | 地址 |
|------|------|
| **线上地址** | https://keen-buttercream-697396.netlify.app/ |
| **GitHub 仓库** | https://github.com/kangkang-del/mind-explorer |
| **GitHub 用户名** | kangkang-del |

## 🏗️ 技术架构

```
前端（静态 HTML/CSS/JS）
  └─ 136 个 HTML 页面
      ├─ index.html（首页，含 auth.js）
      ├─ study/（知识学习板块）
      ├─ health/（心理健康板块）
      ├─ theorists/（心理学家板块）
      ├─ card/（知识卡片详情页，1-96）
      ├─ user/（用户系统页面）
      │   ├─ profile.html（个人主页）
      │   ├─ upload.html（内容上传）
      │   └─ points.html（积分排行榜）
      └─ css/style.css + js/auth.js

后端（Netlify Functions，无服务器）
  └─ netlify/functions/
      ├─ auth-login.js     （GitHub OAuth 登录入口）
      ├─ auth-callback.js  （OAuth 回调处理）
      ├─ auth-logout.js    （登出）
      └─ user-points.js    （积分读写）

数据存储
  └─ GitHub Issues（用户积分存储为 Issue）
  └─ Cookie（Base64 JSON 存储登录态）
```

## ⚙️ 部署配置

### Netlify 配置
- **发布目录**: `.`（根目录）
- **Functions 目录**: `netlify/functions`
- **配置文件**: `netlify.toml`
- **自动部署**: 推送到 GitHub main 分支后自动触发

### GitHub OAuth App 配置
- **回调地址（必须完全匹配）**: `https://keen-buttercream-697396.netlify.app/.netlify/functions/auth-callback`
- **权限范围**: `read:user, public_repo`

### Netlify 环境变量（4个，缺一不可）
| 变量名 | 说明 | 设置位置 |
|--------|------|----------|
| `GITHUB_CLIENT_ID` | GitHub OAuth App 的 Client ID | Netlify → Site settings → Environment variables |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App 的 Client Secret | 同上 |
| `GITHUB_REPO_OWNER` | 仓库拥有者：`kangkang-del` | 同上 |
| `GITHUB_REPO_NAME` | 仓库名：`mind-explorer` | 同上 |

### Git 远程地址格式
```
https://<用户名>:<Personal Access Token>@github.com/kangkang-del/mind-explorer.git
```

## 📁 目录结构速览

```
mind-explorer/
├── index.html              # 首页（引入 auth.js）
├── netlify.toml            # Netlify 部署配置
├── css/style.css           # 全局样式（含手机端适配 + 用户系统样式）
├── js/auth.js              # 用户认证核心逻辑
├── netlify/functions/      # 4个服务端函数
├── study/                  # 知识学习页面
├── health/                 # 心理健康科普页面
├── theorists/              # 心理学家页面
├── card/                   # 知识卡片详情（1-96.html）
├── user/                   # 用户系统页面
│   ├── profile.html        # 个人主页
│   ├── upload.html         # 内容上传（⚠️ 当前为模拟提交）
│   └── points.html         # 积分排行（⚠️ 当前为模拟数据）
└── USER-SYSTEM-GUIDE.md    # 用户系统部署指南
```

## ✅ 已完成的功能

- [x] 完整的 136 页心理学知识静态网站
- [x] GitHub OAuth 登录/注册系统
- [x] 用户信息展示（头像、昵称、积分）
- [x] 用户下拉菜单（主页 / 上传 / 积分 / 退出）
- [x] 积分系统基础架构（基于 GitHub Issues 存储）
- [x] 手机端响应式布局（汉堡菜单 + 全面移动端适配）
- [x] Netlify 自动部署（GitHub push 触发）

## 🚧 待完成的功能

### 高优先级
- [ ] **上传功能真实化** — 当前 `upload.html` 只是弹窗+加积分，没有真正提交内容到仓库
  - 文章类：创建 GitHub Issue 或提交 Markdown 到仓库
  - 图片类：需要图床或 GitHub 仓库存储
  - 链接类：相对简单，存入 GitHub Issue 即可
- [ ] **排行榜真实化** — 当前 `points.html` 使用硬编码的模拟数据，需改为从 GitHub Issues 读取

### 中优先级
- [ ] **点赞/评论功能** — 为知识卡片添加互动功能
- [ ] **用户主页完善** — 显示用户的贡献历史
- [ ] **搜索功能** — 全站知识卡片搜索

### 低优先级
- [ ] **暗色模式**
- [ ] **多语言支持**
- [ ] **PWA 离线访问**

## 🐛 已解决的问题（踩坑记录）

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| Git 初始化位置错误 | 在 `/workspace/` 而非 `/workspace/mind-explorer/` 运行 `git init` | 删除错误 `.git`，用 `git -C` 指定路径 |
| LeanCloud 无法使用 | 已停止新用户注册 | 转向 GitHub + Netlify 方案 |
| GitHub CLI 未登录 | sandbox 环境无 gh 认证 | 改用 Personal Access Token 直接嵌入远程 URL |
| OAuth 回调地址错误 | 用户设为 localhost | 改为 Netlify 实际域名 + `/auth-callback` 路径 |
| Client Secret 占位符 | 用户复制了说明文字而非真正的 Secret | 引导到 GitHub OAuth App 设置页重新生成 |
| 手机端导航栏不可见 | CSS 缺少 `.nav-user-area` 的移动端样式 | 添加 `@media(max-width:768px)` 适配块 |
| 手机端布局仍显怪异 | 导航项太多挤在一行 | 重构为汉堡菜单（☰）折叠式导航 |
| CSS 冲突 | 两处 `@media(768px)` 对 `.nav-links` 设了冲突规则 | 移除旧媒体查询中的 `display:none`，统一由底部新版控制 |

## 📋 日常维护 SOP

### 更新网站内容
```bash
# 1. 修改本地文件
# 2. 提交并推送（Netlify 自动部署）
cd /workspace/mind-explorer
git add -A
git commit -m "描述改动"
git push origin main
# 3. 等 1-2 分钟，访问 keen-buttercream-697396.netlify.app 查看
```

### 修改环境变量
Netlify 控制台 → 选择 Site → Site settings → Environment variables → 修改后重新部署

### 修改 OAuth 配置
GitHub → Settings → Developer settings → OAuth Apps → 找到对应 App 修改

## 💡 开发注意事项

- 所有页面共用 `css/style.css` 和 `js/auth.js`（首页用绝对路径 `/css/style.css`，子目录用相对路径 `../css/style.css`）
- 卡片页面（`card/*.html`）是压缩单行格式的 HTML，批量修改建议用 Python 脚本
- 新增页面必须包含：
  1. `<meta name="viewport" content="width=device-width,initial-scale=1.0">`
  2. 导航栏中的 `☰` 汉堡按钮（用于手机端展开菜单）
  3. 如需登录功能，引入 `<script src="/js/auth.js"></script>`
- Netlify Functions 使用 Node.js 18 runtime，不支持 ES Module（用 CommonJS `require`）
- GitHub API 速率限制：未认证 60次/小时，用 token 认证 5000次/小时

---
*最后更新：2025年 — 由 AI 助手根据项目开发过程自动整理*
