# 🧠 心灵探索 (Mind Explorer)

> 用科学理解心灵，以知识温暖生活 — 心理学知识学习系统

**线上地址**: https://keen-buttercream-697396.netlify.app/

## 快速了解

| 项目 | 说明 |
|------|------|
| **内容** | 96张知识卡片 · 20种心理疾病科普 · 16位心理学家 · 18个经典实验 |
| **技术栈** | 静态 HTML/CSS/JS + GitHub OAuth + Netlify Functions |
| **部署** | 推送到 GitHub → Netlify 自动部署 |

## 📂 项目结构

```
├── index.html              # 首页
├── netlify.toml            # Netlify 配置
├── .gitignore              # Git 忽略规则
├── css/
│   ├── style.css           # 全局样式（含移动端响应式）
│   └── home.css            # 首页专用样式
├── js/
│   ├── utils.js            # 🔧 公共工具函数（XSS防护、时间格式化等）
│   ├── auth.js             # 用户认证系统（GitHub OAuth）
│   ├── card-interact.js    # 卡片详情页互动（点赞/评论）
│   ├── community.js        # 社区交流模块
│   └── study-interact.js   # 学习列表页互动
├── netlify/functions/      # 后端 API（Netlify Serverless Functions）
│   ├── auth-login.js       # OAuth 登录入口
│   ├── auth-callback.js    # OAuth 回调 & Cookie 设置
│   ├── auth-logout.js      # 登出
│   ├── card-interactions.js # 卡片点赞+评论+审核核心 API
│   ├── community.js        # 社区交流后端 API
│   ├── upload-content.js   # 用户上传内容（Issue + Contents API）
│   ├── user-points.js      # 贡献值读写 / 排行榜 API
│   └── admin-review.js     # 管理员审核面板 API
├── study/                  # 知识学习板块（6 页）
├── health/                 # 心理健康科普（18 页）
├── theorists/              # 心理学家介绍（11 页）
├── card/                   # 知识卡片详情（1-96，共 96 页）
├── community/              # 社区交流页面
├── admin/                  # 管理员审核管理
└── user/                   # 用户系统页面
    ├── profile.html        # 个人主页
    ├── upload.html         # 内容上传
    └── points.html         # 贡献值排行榜
```

## ⚙️ 技术架构

### 前端模块职责

| 模块 | 职责 |
|------|------|
| `utils.js` | 公共工具库：escapeHtml、timeAgo、formatDateTime 等（所有页面依赖） |
| `auth.js` | GitHub OAuth 登录/登出、用户信息读取（Cookie）、管理员判断 |
| `card-interact.js` | 卡片页面的点赞(Reactions API) + 评论(Comments API) |
| `community.js` | 社区帖子列表渲染、弹窗详情、认同/评论交互 |
| `study-interact.js` | 学习列表页的卡片互动入口 |

### 后端 Function 职责

| Function | 路由 | 职责 |
|----------|------|------|
| `auth-login` | `/.netlify/functions/auth-login` | 跳转 GitHub OAuth 授权页 |
| `auth-callback` | `/.netlify/functions/auth-callback` | 处理回调，设置登录 Cookie |
| `auth-logout` | `/.netlify/functions/auth-logout` | 清除 Cookie，登出 |
| `card-interactions` | `/.netlify/functions/card-interactions` | 点赞/评论/审核（核心数据 API） |
| `community` | `/.netlify/functions/community` | 社区帖子列表/认同/评论 |
| `upload-content` | `/.netlify/functions/upload-content` | 用户上传内容到仓库 |
| `user-points` | `/.netlify/functions/user-points` | 贡献值 CRUD / 排行榜 |
| `admin-review` | `/.netlify/functions/admin-review` | 管理员审核操作 |

### 数据存储方案

| 数据类型 | 存储方式 | API |
|----------|----------|-----|
| 用户登录态 | Base64 JSON Cookie | - |
| 点赞/认同 | GitHub Reactions API | `POST/DELETE .../reactions` |
| 评论 | GitHub Issue Comments | `POST .../comments` |
| 用户贡献值 | `[POINTS]` Issue body | Issues API |
| 上传内容 | `[UPLOAD]` Issue | Issues API |
| 图片文件 | GitHub Contents API | Contents API |

### 关键依赖关系

```
index.html → utils.js → auth.js (必须按此顺序加载)
card/*.html → auth.js → card-interact.js (依赖 Auth 对象)
community/index.html → auth.js → community.js (依赖 Auth 对象)
study/*.html → auth.js → study-interact.js (依赖 Auth 对象)
```

## 🚀 部署配置

### Netlify 环境变量（5 个）

| 变量名 | 说明 |
|--------|------|
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret |
| `GITHUB_REPO_OWNER` | 仓库拥有者用户名 |
| `GITHUB_REPO_NAME` | 仓库名称 |
| `GITHUB_REPO_TOKEN` | 仓库 PAT（用于图片上传） |

### GitHub OAuth App 设置

- **回调地址**: `{你的域名}/.netlify/functions/auth-callback`
- **权限范围**: `read:user, public_repo`

## ✅ 已完成功能

- [x] 136 页心理学知识静态网站
- [x] GitHub OAuth 登录/注册系统
- [x] 卡片点赞（Reactions API）+ 评论（Comments API）
- [x] 社区交流（帖子列表 + 认同 + 评论）
- [x] 真实上传功能（文章/链接/图片 → GitHub Issues + Contents API）
- [x] 管理员审核系统（评论审核 + 上传审核）
- [x] 贡献值系统（基于 GitHub Issues 存储）
- [x] 移动端响应式适配（汉堡菜单）

## 🚧 待完成

- [ ] 排行榜真实化（当前为模拟数据）
- [ ] 用户主页完善（上传历史 + 评论记录）
- [ ] 全站搜索功能
- [ ] 暗色模式 / PWA

## 💡 开发注意事项

- 所有页面共用 `css/style.css`；子目录用相对路径 `../css/style.css`
- 新增页面必须包含 viewport meta + 汉堡菜单按钮
- 需要登录功能的页面引入 `<script src="/js/auth.js"></script>`
- Netlify Functions 使用 Node.js runtime，CommonJS 模块（`require`）
- GitHub API 速率限制：认证 5000次/小时，未认证 60次/小时
- **脚本加载顺序**: `utils.js` 必须在 `auth.js` 之前加载（auth.js 间接依赖 Utils）

---

*本项目仅供学习交流使用*
