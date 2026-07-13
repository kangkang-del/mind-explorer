# 心灵探索（Mind Explorer）Vue3 改版 — 总体计划

> 本文档基于已确认的 5 项关键决策，规划从「原生静态站」向「Vue 3 单页应用」迁移的总体方案。
> 重点模块：**心灵晴天（温暖内容流 + 防冷场自动推送）**、**同行者小木（AI 陪伴）**，以及二者与首页的联动。

---

## 一、项目范围与导航结构

| 导航项 | 页面定位 | 关键能力 |
|--------|----------|----------|
| 首页 | 综合门户 | 四大入口 + 每日精选流（来自心灵晴天，按优先级选取） |
| 了解心理学知识 | 内容库 | 复用 96 卡片 / 20 疾病 / 16 心理学家 / 18 实验，Vue3 化 |
| 同行者（小木） | AI 对话 | 温柔心理学家/哲学家角色，聊天 + 解答 + 语录 |
| **心灵晴天** | **温暖内容流** | **社区互动 + 自动推送防冷场（核心模块）** |
| 反馈与建议 | 表单 | 分类 + 匿名 + 图片 |
| 个人中心 | 用户页 | 头像 / 收藏 / 反馈 / 对话记录 |

---

## 二、技术架构

| 层级 | 选型 | 说明 |
|------|------|------|
| 前端 | Vue 3 + Vite + Vue Router + Pinia | 单页应用，状态集中管理 |
| UI 库 | Element Plus 或 Naive UI | 快速搭表单/弹窗/卡片 |
| 后端 | Netlify Functions（Node.js） | 复用现有 8 个函数体系，新增推送函数 |
| 存储 | GitHub API（Issues/Contents）或轻量数据库 | 见「待确认事项」 |
| 定时任务 | GitHub Actions 定时触发 / 前端懒触发 | 负责「每天固定推送」 |
| AI | 大模型 API（DeepSeek / 通义 / OpenAI） | 小木对话 + 语录生成 |
| 外部图源 | The Cat API / The Dog API / Unsplash / Picsum | 猫狗 / 美好环境图 |

---

## 三、目录结构与路由

```
mind-explorer-vue/
├── src/
│   ├── views/
│   │   ├── HomeView.vue          # 首页
│   │   ├── KnowledgeView.vue     # 了解心理学知识
│   │   ├── CompanionView.vue     # 同行者（小木）
│   │   ├── SunnyView.vue         # 心灵晴天
│   │   ├── FeedbackView.vue      # 反馈与建议
│   │   └── ProfileView.vue       # 个人中心
│   ├── components/
│   │   ├── AppNavbar.vue
│   │   ├── AppFooter.vue
│   │   ├── FloatingCompanion.vue # 右下角常驻小木
│   │   ├── PostCard.vue          # 内容流卡片（统一）
│   │   ├── PostComposer.vue      # 发帖编辑器
│   │   ├── CommentList.vue
│   │   ├── CategoryTabs.vue      # 猫狗/善意/环境 分类
│   │   └── XiaomuQuote.vue       # 小木语录卡
│   ├── stores/                   # Pinia：user / posts / companion
│   ├── api/                      # 后端接口封装
│   └── utils/
└── netlify/functions/
    ├── sunny-push.js             # 【新增】每日自动抓取推送
    ├── posts.js                  # 帖子增删查 + 互动
    ├── companion.js              # 小木对话
    └── ...（沿用原 8 个）
```

**路由表**

| 路径 | 视图 | 说明 |
|------|------|------|
| `/` | HomeView | 首页精选流 |
| `/knowledge` | KnowledgeView | 心理学知识 |
| `/companion` | CompanionView | 小木对话 |
| `/sunny` | SunnyView | 心灵晴天 |
| `/feedback` | FeedbackView | 反馈 |
| `/profile` | ProfileView | 个人中心 |

---

## 四、数据模型

### 帖子 Post（心灵晴天 + 首页共用）

```ts
interface Post {
  id: string
  type: 'user' | 'auto' | 'xiaomu'   // 用户帖 / 自动推送 / 小木语录
  authorId: string                   // user: 用户ID; auto: 'system'; xiaomu: 'xiaomu'
  authorName: string
  category: 'cat' | 'dog' | 'kindness' | 'nature' | 'quote'
  title: string
  content: string
  images: string[]                   // 外链 URL
  sourceApi?: string                 // 自动推送时记录来源
  createdAt: number
  likes: number
  likedByMe?: boolean
  comments: Comment[]
  isAutoPush: boolean
}
```

### 评论 Comment

```ts
interface Comment {
  id: string
  postId: string
  authorId: string
  authorName: string
  content: string
  createdAt: number
}
```

### 用户偏好 Preference（个性化推荐用）

```ts
interface Preference {
  userId: string
  categoryWeights: { cat: number; dog: number; kindness: number; nature: number }
  // 浏览/点赞某类内容时权重 +1，用于首页与流内排序
}
```

---

## 五、心灵晴天详细设计（核心）

### 5.1 内容分类

| 分类 | 标签 | 来源 |
|------|------|------|
| 猫 | 🐱 cat | The Cat API |
| 狗 | 🐶 dog | The Dog API |
| 善意行为 | 🤝 kindness | AI 生成文案 + 风景/人物配图 |
| 美好环境 | 🌅 nature | Unsplash / Picsum |
| 小木语录 | 💬 quote | 小木 AI 生成（穿插） |

### 5.2 自动推送机制（防冷场）

**触发规则（已确认）**：每天固定时间推送一次；若当日内容不足/无新帖，则补位推送，确保流不空。

**实现流程（推荐：定时任务驱动）**

```
GitHub Actions / 云定时器（每日 08:00）
        │
        ▼
sunny-push.js（Netlify Function）
        │  1. 调用外部 API 抓取：猫图×N、狗图×N、风景图×N
        │  2. 调用大模型生成「善意行为」文案 ×N + 小木语录 ×1
        │  3. 组装为 type='auto' / type='xiaomu' 的 Post
        ▼
写入存储（GitHub Issues / 数据库）
        │
        ▼
心灵晴天 & 首页 读取时即可见「✨ 今日晴天」标签帖子
```

**兜底方案（前端懒触发）**：若暂未配置定时任务，前端在「每日首次打开」时检查 `todayHasAutoPush`，若无则调用 `sunny-push.js` 即时拉取并写入，避免空流。

### 5.3 用户发帖与互动（已确认：完整发帖）

- **发帖**：`PostComposer` 支持图文（图片走上传接口 / 外部链接），可选分类。
- **互动**：点赞（认同）、评论 —— **对「用户帖」和「自动推送帖」都生效**（用户可给猫狗图、善意文案点赞评论）。
- 自动推送帖仅在 `isAutoPush=true` 时禁止删除/编辑（系统内容）。

### 5.4 首页联动规则（已确认）

> 内容先在「心灵晴天」里存在；首页从心灵晴天选取，按以下优先级，且**每天更新一次**。

```
首页「今日精选」选取算法：
  1. 取 用户 24 小时内发的帖（type='user', createdAt > now-24h） → 优先展示
  2. 不足则补 自动推送内容（type='auto' / 'xiaomu'，当日）
  3. 若当日无任何内容 → 触发兜底拉取
  4. 每天 00:00 重新计算一次首页精选缓存
```

**展示形式**：首页精选以 `PostCard` 网格呈现；心灵晴天内自动推送帖带「✨ 今日晴天」标签，与用户帖视觉区分但同流共存。

### 5.5 小木语录穿插（已确认：两者都要）

- 每日自动推送中生成 1 条 `type='xiaomu'` 语录，以 `XiaomuQuote` 卡样式穿插在流顶部。
- 语录风格：温柔、有哲学意味、不评判（符合小木人设）。

### 5.6 个性化推荐（已确认：两者都要）

- 记录用户对各分类的浏览/点赞行为 → 更新 `Preference.categoryWeights`。
- **流内排序**：在基础时间序之上，对高权重分类轻微提权。
- **首页**：优先展示用户偏好分类的内容（如爱看猫狗则多推）。
- 个性化仅做「轻排序」，不剥夺「每日固定推送」的确定性。

---

## 六、首页设计

```
[ Banner / 每日一句（小木语录） ]
[ 四大入口卡片：了解知识 / 同行者 / 心灵晴天 / 反馈 ]
[ 今日精选流（来自心灵晴天，按 §5.4 规则）]
[ 右下角常驻小木悬浮入口 ]
```

---

## 七、同行者「小木」设计

- **人设（system prompt）**：温柔的心理学家与哲学家，善于倾听、不评判、用通俗语言解释心理学、引导自我觉察。
- **功能**：流式对话（打字机效果）、历史记录、情绪感知、**危机干预**（识别自伤倾向时弹出援助热线）。
- **与心灵晴天联动**：小木生成的语录进入心灵晴天流（§5.5）。

---

## 八、其他页面

- **了解心理学知识**：左侧分类树 + 右侧卡片网格 + 搜索 + 筛选，复用已有 `cards.json` / `health.json`。
- **反馈与建议**：分类（建议/问题/感谢）+ 文字 + 图片 + 匿名开关。
- **个人中心**：头像、我的收藏、我的反馈、对话记录、设置。

---

## 九、自动推送后台实现（sunny-push.js 伪代码）

```js
exports.handler = async () => {
  const today = dateKey()
  if (await alreadyPushed(today)) return { ok: true, skipped: true }

  const [cats, dogs, natures] = await Promise.all([
    fetchCatImages(6),
    fetchDogImages(6),
    fetchNatureImages(6),
  ])
  const kindness = await generateKindnessPosts(4)   // 调大模型
  const quote = await generateXiaomuQuote()          // 小木语录

  const posts = [
    ...toAutoPosts(cats, 'cat'),
    ...toAutoPosts(dogs, 'dog'),
    ...toAutoPosts(natures, 'nature'),
    ...kindness,
    quote,
  ]
  await savePosts(posts)
  return { ok: true, count: posts.length }
}
```

---

## 十、实施阶段（里程碑）

| 阶段 | 内容 | 交付物 |
|------|------|--------|
| **P0 骨架** | Vite 工程、路由、导航栏、布局组件、Footer | 可运行空壳站点 |
| **P1 内容** | 了解心理学知识页（复用数据） + 反馈页 + 个人中心 | 3 个静态功能页 |
| **P2 心灵晴天** | PostCard / Composer / 评论 / 分类 Tab / 首页联动 | 完整内容流 |
| **P3 自动推送** | sunny-push.js + 定时任务 + 外部 API 接入 + 兜底 | 防冷场机制 |
| **P4 小木** | CompanionView + 对话 API + 语录生成 + 危机干预 | AI 陪伴 |
| **P5 个性化** | Preference 记录 + 流内/首页排序 | 轻个性化 |
| **P6 打磨** | 响应式、加载态、空态、动效、PWA | 上线候选 |

---

## 十一、待确认事项（需你后续拍板）

1. **存储方案**：继续用 GitHub API，还是引入 Supabase / 轻量数据库？（影响自动推送写入与查询性能）
2. **大模型供应商**：小木对话与语录生成用哪家 API？（需 Key 与费用评估）
3. **外部图源 Key**：Unsplash / The Cat API 等是否注册了 API Key？未注册则先用无需 Key 的源（Dog CEO、Cataas、Picsum）。
4. **定时任务载体**：用 GitHub Actions 还是云平台定时器？（决定「每天固定推送」的可靠性）
5. **UGC 审核**：用户发帖是否沿用原「管理员审核」流程？

---

> 计划已就绪。确认后我可从 **P0 骨架** 或你指定的任意阶段开始落地实现。
