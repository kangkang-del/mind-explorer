# 设计 Token 与旧色值映射

> 依据：《心灵探索者 三端 UI 设计与开发总手册 V2.0》分册一 §2
> 状态：**阶段 1 只建词表，组件里的硬编码色值一律未改。** 替换在阶段 5 与插画一并进行。
> 最后更新：2026-11-12

## 1. 为什么先只建词表

组件里现有 **1074 处**十六进制色值，散布在 40+ 个 `.vue` 文件。一次性替换会产出几千行 diff，
既没法逐页验收，也会把「结构改造」和「视觉换皮」混在同一个提交里 —— 手册明确禁止。

所以阶段 1 只做两件事：

1. 在 `tailwind.config.js` 里定义**正式语义 token**（未使用的 token 不会生成任何 CSS，零运行时成本）；
2. 在本文档里建立**旧值 → token 的映射关系**，让阶段 5 的替换有据可依。

## 2. 正式 token

| Token | 值 | Tailwind 写法 | 用途 / 约束 |
|---|---|---|---|
| `brand.primary` | `#345B8E` | `bg-brand-primary` `text-brand-primary` | 主品牌蓝：主要按钮、重点文字、选中态 |
| `brand.secondary` | `#7C9CB8` | `bg-brand-secondary` | 辅助蓝：导航、图标、辅助强调（沿用现网） |
| `ink.DEFAULT` | `#263746` | `text-ink` | 三端统一主文字色 |
| `ink.muted` | `#5A6B7C` | `text-ink-muted` | 次级文字（现网值，手册未定义，作为补充层级） |
| `ink.faint` | `#9AA6B2` | `text-ink-faint` | 弱文字 / 占位（同上） |
| `urgent.DEFAULT` | `#D87945` | `bg-urgent` `text-urgent` | 紧急 / 风险强调橙 |
| `urgent.soft` | `#F0A868` | `bg-urgent-soft` | 橙块底色 / 描边 |
| `urgent.ink` | `#C2410C` | `text-urgent-ink` | 橙底上的深色文字 |
| `surface.desktop` | `#F2F0E8` | `bg-surface-desktop` | 桌面与平板暖纸底 |
| `surface.mobile` | `#FAFBFD` | `bg-surface-mobile` | 手机明亮浅白底 |
| `surface.card` | `#FFFFFF` | `bg-surface-card` | 卡片表面 |
| `line.subtle` | `#E6EAF0` | `border-line-subtle` | 弱边界 |

两条硬约束：

- **紧急橙必须同时有文字或图标语义**，不能只靠颜色区分。
- 表面底色允许按设备适配（暖纸 / 浅白），但**品牌语义必须三端一致**。

## 3. 旧值映射表（阶段 5 执行依据）

统计范围：`src/**/*.{vue,js,css}`，2026-11-12 实测。

| 旧值 | 出现次数 | 涉及文件数 | 最集中的文件 | 目标 token | 备注 |
|---|---|---|---|---|---|
| `#7c9cb8` | 132 | 26 | Companion(22)、Knowledge(12)、Profile(11) | `brand.secondary` | 值不变，只换成 token 名 |
| `#3a4a5c` | 104 | 24 | Profile(17)、AppNavbar(13)、Companion(10) | `ink.DEFAULT` | **值会变**（→ `#263746`），需视觉复核 |
| `#5a6b7c` | 89 | 22 | AppNavbar(20)、Knowledge(8)、AccountPurge(7) | `ink.muted` | 值不变 |
| `#9aa6b2` | 108 | 25 | Profile(18)、Companion(15)、Admin(13) | `ink.faint` | 值不变 |
| `#e07a3f` | 29 | 16 | Home(5)、FavoriteButton(3)、Profile(3) | `urgent.DEFAULT` | **值会变**（→ `#D87945`） |
| `#f0a868` | 8 | 5 | Home(3)、FavoriteButton(2)、CrisisSupport(1) | `urgent.soft` | 值不变 |
| `#c2410c` | 9 | 3 | XiaomuModelPanel(5)、VoicePanel(2)、Wardrobe(2) | `urgent.ink` | 值不变 |
| `#eef2f7` | 76 | 19 | Profile(15)、Admin(7)、Companion(7) | `line.subtle` | **值会变**（→ `#E6EAF0`） |
| `#e0e6ec` | 35 | 14 | Companion(10)、Profile(4)、Upload(4) | `line.subtle` | 同上，三套边框灰需合并 |
| `#e2e8f0` | 16 | 6 | Knowledge(4)、CardDetail(3)、Community(3) | `line.subtle` | 同上 |
| `#f0f4f9` | 43 | 14 | AppNavbar(23)、Companion(5) | **待定** | 浅蓝底/悬停态，手册未给 token，需设计确认 |
| `#a8c3d6` | 18 | 12 | Companion(5)、AppNavbar(2)、Upload(2) | **待定** | 渐变末端，与 `#7c9cb8` 配对使用 |
| `#fafbfc` | 2 | 2 | App.vue、Companion | `surface.mobile` | 手机底色 |
| `#f7f4ef` | 2 | 2 | home.css、style.css | `surface.desktop` | 现网实为 `#F7F4EF`，手册为 `#F2F0E8` |

### 三处「值会变」的视觉风险

替换后颜色会有细微变化，必须在阶段 5 逐页截图对比：

1. 主文字 `#3a4a5c` → `#263746`：变深、偏冷，共 104 处，影响面最大；
2. 紧急橙 `#e07a3f` → `#D87945`：饱和度更高、偏砖红，29 处；
3. 边框灰三合一 → `#E6EAF0`：三套灰（`eef2f7` / `e0e6ec` / `e2e8f0`）合并为一套，127 处。

## 4. 阶段 5 的替换顺序（建议）

1. 先 `line.subtle`（只影响边框，风险最低，127 处）；
2. 再 `brand.secondary` / `ink.faint` / `ink.muted`（值不变，纯改名，329 处）；
3. 再 `urgent.*`（29 + 8 + 9 处，需逐页看橙色语义）；
4. 最后 `ink.DEFAULT`（104 处，主文字，改完整体观感会变）；
5. `#f0f4f9` / `#a8c3d6` 等「待定」项，等设计给出 token 后再动。

每步单独提交，附「替换前后同视口截图」。

## 5. 禁止事项

- 禁止在组件里新增硬编码色值；新增样式一律走 token。
- 禁止为了省事直接改 token 的值去「凑」某个页面 —— 那是设计决策，不是实现细节。
- 旧键 `brand.blue / green / orange / ink / sub` 保留到阶段 5 结束后再删，避免中途出现「一半有 token 一半没有」的状态。
