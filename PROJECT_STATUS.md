# 心灵探索 (Mind Explorer) — Vue 3 迁移项目报告

> **最后更新**: 2025-07-08  
> **项目仓库**: https://github.com/kangkang-del/mind-explorer  
> **在线预览(Vue版)**: https://kangkang-del.github.io/mind-explorer/  
> **在线预览(原版)**: 部署在 Netlify  

---

## 一、项目概述

### 1.1 项目简介
「心灵探索」是一个心理学知识科普网站，包含知识卡片、心理健康科普、社区交流等功能。项目正在从**纯静态 HTML 多页面架构**迁移到 **Vue 3 + Vite 单页应用架构**。

### 1.2 技术栈

| 层级 | 原版 | Vue 版 |
|------|------|--------|
| **前端框架** | 原生 HTML + JS | Vue 3 + Vite |
| **路由** | 多 HTML 文件跳转 | Vue Router 4 |
| **状态管理** | 全局变量 (Auth 对象) | Pinia |
| **API 请求** | 原生 fetch | Axios |
| **UI 组件库** | 无 | Element Plus |
| **后端** | Netlify Functions | Netlify Functions (保留) |
| **数据库** | GitHub Issues API | Supabase (评论/点赞/社区) |
| **认证** | GitHub OAuth | GitHub OAuth + 游客模式 (双方案: Netlify Functions + 纯前端 PKCE) |
| **部署** | Netlify | GitHub Pages (前端) + Netlify (后端) |

---

## 二、初步目标

### 2.1 核心目标
将 141 个静态 HTML 文件重构为 Vue 3 单页应用，实现：
- **96 张知识卡片**从独立 HTML 变为 1 个组件 + 1 个 JSON 数据文件
- **统一导航栏/Footer**，不再每个页面重复编写
- **统一状态管理**，登录状态、用户信息由 Pinia 集中管理
- **游客评论系统**，无需 GitHub 登录即可参与讨论

### 2.2 功能需求清单

| 模块 | 功能点 | 优先级 |
|------|--------|--------|
| 知识卡片 | 96张卡片浏览、详情页、分类筛选 | P0 |
| 心理健康 | 20个主题浏览、详情页 | P0 |
| 评论系统 | 游客评论、GitHub用户评论 | P1 |
| 登录系统 | GitHub OAuth、游客模式 | P1 |
| 社区交流 | 帖子发布、认同、评论 | P2 |
| 用户系统 | 个人主页、贡献值、上传内容 | P2 |
| 管理后台 | 内容审核 | P3 |
| 部署 | Netlify + GitHub Pages | P3 |

---

## 三、当前进展

### 3.1 已完成 ✅

| 任务 | 说明 | 状态 |
|------|------|------|
| Vue 3 项目搭建 | Vite + Vue Router + Pinia + Axios + Element Plus | ✅ |
| 96张卡片数据提取 | 从 96 个 HTML 提取为 `cards.json` (174KB) | ✅ |
| 20个健康主题数据提取 | 从 20 个 HTML 提取为 `health.json` (108KB) | ✅ |
| 首页 | Hero 区域 + 热门卡片网格 | ✅ |
| 知识列表页 | 96张卡片 + 分类筛选 | ✅ |
| 卡片详情页 | 内容展示 + 评论区 + 点赞按钮 | ✅ |
| 心理健康列表页 | 20个主题卡片 | ✅ |
| 心理健康详情页 | 6章节内容 + 症状列表 + 应对方式 | ✅ |
| 导航栏组件 | GitHub登录 + 游客模式弹窗 | ✅ |
| 登录状态管理 | Pinia store (GitHub + 游客双模式) | ✅ |
| Supabase 集成 | 游客评论直连 Supabase，无需后端 | ✅ |
| GitHub Pages 部署 | Vue 构建产物部署到 gh-pages 分支 | ✅ |
| 原版 Bug 修复 | OAuth 登录崩溃 + PC端水母覆盖 | ✅ |
| 点赞功能 | Supabase `guest_likes` 表，游客/用户均可点赞 | ✅ |
| 评论功能联调 | Supabase URL 已修复，评论/点赞实测可用 | ✅ |
| 游客模式完善 | 游客身份管理、退出登录、导航跳转主页 | ✅ |
| 社区交流页面 | 帖子列表/发帖/认同/评论 (Supabase 三表) | ✅ |
| 用户个人主页 | 资料/发布帖子/我的评论，导航栏可跳转 | ✅ |
| GitHub OAuth 双方案 | Netlify Functions + 纯前端 PKCE (callback.html)，代码就绪 | ✅ |
| 部署指南 | DEPLOY_GUIDE.md (Netlify / GitHub Pages 两套步骤) | ✅ |

### 3.2 进行中 🔄

| 任务 | 说明 | 状态 |
|------|------|------|
| GitHub OAuth 配置 | 代码已就绪，需用户创建 OAuth App + 填写 Client ID/Secret | 🔄 |
| 内容上传功能 | 用户上传知识卡片 (后端 API 待定) | 🔄 |

### 3.3 待完成 ⏳

| 任务 | 优先级 | 说明 |
|------|--------|------|
| **配置 GitHub OAuth App** | P1 | 见 `DEPLOY_GUIDE.md`，创建 App → 填 ID/Secret → 测试登录 |
| 内容上传功能 | P2 | 用户上传知识卡片 |
| 用户贡献值/等级 | P2 | 基于发帖/评论计算 (user-points) |
| 管理后台 | P3 | 内容审核界面 |
| 性能优化 | P3 | 按需引入 Element Plus、代码分割、图片优化 |

---

## 四、项目架构

### 4.1 目录结构

```
mind-explorer-vue/
├── src/
│   ├── api/
│   │   ├── supabase.js          # Supabase 客户端
│   │   ├── card.js              # 卡片 API (评论/点赞, 直连 Supabase)
│   │   └── community.js         # 社区 API (帖子/认同/评论, 直连 Supabase)
│   ├── utils/
│   │   └── githubOAuth.js       # 纯前端 GitHub OAuth (PKCE)
│   ├── assets/
│   │   └── style/
│   │       ├── style.css        # 全局样式 (从原项目迁移)
│   │       └── home.css         # 首页样式 (从原项目迁移)
│   ├── components/
│   │   ├── Navbar.vue           # 导航栏 (含登录弹窗 + 主页跳转)
│   │   ├── Footer.vue           # 页脚
│   │   └── Card/
│   │       └── CardItem.vue     # 知识卡片组件
│   ├── data/
│   │   ├── cards.json           # 96张知识卡片数据
│   │   └── health.json          # 20个心理健康主题数据
│   ├── router/
│   │   └── index.js             # Vue Router 配置 (含 /user/profile)
│   ├── stores/
│   │   └── auth.js              # Pinia 认证状态 (GitHub + 游客 + 双方案 OAuth)
│   ├── views/
│   │   ├── Home.vue             # 首页
│   │   ├── Card/
│   │   │   └── CardDetail.vue   # 卡片详情页 (含评论/点赞)
│   │   ├── Community/
│   │   │   ├── Community.vue    # 社区交流页 (帖子列表/发帖)
│   │   │   └── PostDetail.vue   # 帖子详情页 (认同/评论)
│   │   ├── User/
│   │   │   └── Profile.vue      # 用户个人主页
│   │   ├── Study/
│   │   │   └── Study.vue        # 知识学习列表页
│   │   └── Health/
│   │       ├── Health.vue       # 心理健康列表页
│   │       └── HealthDetail.vue # 心理健康详情页
├── public/
│   └── callback.html            # GitHub OAuth 回调处理页（纯前端 PKCE）
├── netlify/
│   └── functions/               # Netlify Functions (8个)
│       ├── auth-login.js        # GitHub OAuth 登录入口
│       ├── auth-callback.js     # OAuth 回调 (已修复重定向到 /mind-explorer/)
│       ├── auth-logout.js       # 登出
│       ├── card-interactions.js # 卡片交互 (原版，待适配)
│       ├── community.js         # 社区功能 (原版，待适配)
│       ├── upload-content.js    # 内容上传
│       ├── user-points.js       # 用户贡献值
│       └── admin-review.js      # 管理审核
├── netlify.toml                 # Netlify 部署配置 (Vite 构建)
│   ├── App.vue                  # 根组件
│   └── main.js                  # 入口文件
├── netlify/
│   └── functions/               # Netlify Functions (从原项目复制)
│       ├── auth-login.js
│       ├── auth-callback.js
│       ├── auth-logout.js
│       ├── card-interactions.js
│       ├── community.js
│       ├── upload-content.js
│       ├── user-points.js
│       └── admin-review.js
├── netlify.toml                 # Netlify 部署配置
├── vite.config.js               # Vite 配置
├── package.json
└── index.html
```

### 4.2 数据流架构

```
用户浏览器
    ├── 浏览页面 → 本地 cards.json / health.json (静态数据)
    ├── 游客评论 → Supabase (直连，无需后端)
    ├── GitHub 登录 → Netlify Functions → GitHub OAuth
    └── 点赞 → Netlify Functions → GitHub Issues API
```

### 4.3 Supabase 数据库结构

```sql
-- 游客评论表 (卡片评论)
CREATE TABLE guest_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id INTEGER NOT NULL,
  user_type TEXT NOT NULL DEFAULT 'guest',  -- 'guest' 或 'github'
  username TEXT NOT NULL,
  avatar TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 点赞表 (卡片点赞, UNIQUE(card_id, user_identifier))
CREATE TABLE guest_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id INTEGER NOT NULL,
  user_identifier TEXT NOT NULL,     -- 游客 id 或 GitHub 用户名
  user_type TEXT NOT NULL DEFAULT 'guest',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 社区帖子表
CREATE TABLE community_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  user_type TEXT NOT NULL DEFAULT 'guest',
  username TEXT NOT NULL,
  avatar TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 帖子评论表
CREATE TABLE post_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES community_posts(id),
  content TEXT NOT NULL,
  user_type TEXT NOT NULL DEFAULT 'guest',
  username TEXT NOT NULL,
  avatar TEXT,
  user_identifier TEXT,              -- 用于个人主页查询
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 帖子认同表
CREATE TABLE post_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES community_posts(id),
  user_identifier TEXT NOT NULL,
  user_type TEXT NOT NULL DEFAULT 'guest',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS 策略 (所有表): 任何人可读、任何人可写（游客无需 Supabase 登录）
```

### 4.4 认证体系

```
Auth Store (Pinia)
├── user: GitHub 用户信息 (从 cookie me_user 恢复)
├── guest: 游客信息 (从 localStorage 恢复)
├── isLoggedIn: user || guest
├── currentUser: user || guest
├── isGuest: !user && guest
└── displayName: user.name || guest.name
```

---

## 五、关键配置信息

### 5.1 Supabase 配置

| 配置项 | 值 |
|--------|-----|
| Project URL | `https://bbdfeiceezcbcbsbnznr.supabase.co` |
| Publishable Key | `sb_publishable_cQdWdavPKrSJZw_GuNByyg_Eb9_v5vg` |
| 评论表名 | `guest_comments` |
| RLS | 允许匿名读/写 |

### 5.2 GitHub 配置

| 配置项 | 值 |
|--------|-----|
| 仓库 | `kangkang-del/mind-explorer` |
| GitHub Pages | `gh-pages` 分支 |
| 访问 URL | https://kangkang-del.github.io/mind-explorer/ |
| Vite base | `/mind-explorer/` |

### 5.3 Netlify Functions (原项目)

| Function | 用途 |
|----------|------|
| `auth-login` | GitHub OAuth 登录入口 |
| `auth-callback` | OAuth 回调处理 |
| `auth-logout` | 登出 |
| `card-interactions` | 点赞/评论 (GitHub Issues API) |
| `community` | 社区帖子/认同 |
| `upload-content` | 用户上传内容 |
| `user-points` | 贡献值管理 |
| `admin-review` | 管理员审核 |

---

## 六、后续开发指南

### 6.1 下一步优先任务

#### 任务 1：接上 GitHub OAuth 登录 (P1) 🔄

**目标**：让 GitHub 用户能登录并评论（当前游客模式已可用，GitHub OAuth 前端逻辑就绪但未联调）

**步骤**：
1. 将 `netlify/functions/` 部署到 Netlify
2. 配置 GitHub OAuth App 的回调 URL
3. 修改 `auth-callback.js` 中的重定向 URL 指向 Vue 应用
4. 测试 OAuth 流程

**关键文件**：
- `netlify/functions/auth-callback.js` — OAuth 回调处理
- `src/stores/auth.js` — 前端认证状态

#### ✅ 已完成：点赞功能 (P1)

已采用方案 B —— 在 Supabase 新建 `guest_likes` 表，游客/用户均可对卡片点赞/取消，直连 Supabase 无需后端。见 `src/api/card.js`。

#### ✅ 已完成：社区交流页面 (P2)

已建 `community_posts` / `post_comments` / `post_likes` 三张表，开发 `Community.vue`（帖子列表+发帖）与 `PostDetail.vue`（认同+评论）。见 `src/api/community.js`。

#### ✅ 已完成：用户个人主页 (P2)

已开发 `src/views/User/Profile.vue`：展示资料、发布帖子数、我的评论，导航栏头像/昵称可点击跳转 `/user/profile`。

#### 任务 5：部署到 Netlify (P3)

**目标**：前端 + 后端统一部署，启用 GitHub OAuth 与内容上传

**配置**：
```toml
[build]
  command = "npm run build"
  publish = "dist"
  functions = "netlify/functions"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### 6.2 开发环境配置

```bash
# 安装依赖
npm install

# 开发模式启动
npm run dev

# 构建
npm run build

# 预览构建产物
npm run preview
```

### 6.3 部署方式

| 平台 | 用途 | 命令 |
|------|------|------|
| GitHub Pages | 前端预览 | `git push origin HEAD:gh-pages --force` (dist 目录) |
| Netlify | 前端 + 后端 | 连接 GitHub 仓库自动部署 |
| Vercel | 替代方案 | `npx vercel --prod` |

### 6.4 数据文件更新

如果原项目的卡片内容更新，重新生成 JSON：

```bash
# 在原项目根目录运行 Node 脚本
node convert-cards.js    # 生成 cards.json
# health.json 需用 Python 脚本生成 (见仓库脚本)
```

---

## 七、已知问题与限制

| 问题 | 影响 | 解决方案 |
|------|------|---------|
| GitHub Pages 部署无后端 | OAuth 登录、点赞不可用 | 迁移到 Netlify 部署 |
| GitHub Token 硬编码在 remote URL | 安全风险 | 改用 GitHub Secrets |
| Element Plus 完整引入 | 打包体积大 (1.1MB) | 改为按需引入 |
| 无 SEO 支持 | 搜索引擎无法索引 SPA 内容 | 考虑 SSR (Nuxt) 或预渲染 |
| 评论无防刷机制 | 可能被恶意刷评论 | 添加速率限制或验证码 |

---

## 八、AI 协作指南

### 8.1 快速上手

1. **阅读本文件**了解项目全貌
2. **查看 `src/data/cards.json`** 了解卡片数据结构
3. **查看 `src/stores/auth.js`** 了解认证体系
4. **查看 `src/api/card.js`** 了解 API 调用方式
5. **查看 `netlify/functions/`** 了解后端逻辑

### 8.2 常见开发任务

| 任务 | 涉及文件 |
|------|---------|
| 添加新页面 | `src/router/index.js` + `src/views/` |
| 修改导航栏 | `src/components/Navbar.vue` |
| 添加 API | `src/api/` + `netlify/functions/` |
| 修改认证逻辑 | `src/stores/auth.js` |
| 添加 Supabase 表 | Supabase 控制台 SQL Editor |
| 更新卡片数据 | `src/data/cards.json` |
| 更新健康主题 | `src/data/health.json` |

### 8.3 提交规范

```
🔧 修复 xxx
✨ 新增 xxx
📦 数据更新
🚀 部署相关
📝 文档更新
```

---

## 九、版本历史

| 日期 | Commit | 说明 |
|------|--------|------|
| 2025-07-05 | `4e8896c` | 原项目修复：Auth 保护、Cookie、管理员、utils.js |
| 2025-07-05 | `f345a9d` | 修复 OAuth 登录崩溃 + PC端水母覆盖 |
| 2025-07-07 | `f23e945` | 添加 cards.json + health.json 数据文件 |
| 2025-07-07 | `2c986cb` | Vue 版部署到 GitHub Pages |
| 2025-07-07 | 修复 Supabase URL | 修复评论功能 |
| 2025-07-08 | 社区交流页面 | Community.vue + PostDetail.vue + 3 张 Supabase 表 |
| 2025-07-08 | 用户个人主页 | Profile.vue + 路由 + 导航跳转 + SPA fallback 同步 |
| 2025-07-08 | GitHub OAuth 双方案 | Netlify Functions (auth-callback 重定向修复) + 纯前端 PKCE (callback.html) |
| 2025-07-08 | 部署指南 | DEPLOY_GUIDE.md，Netlify / GitHub Pages 两套部署步骤 |

---

*本报告由 AI 辅助生成，用于项目进度跟踪和 AI 协作参考。*
