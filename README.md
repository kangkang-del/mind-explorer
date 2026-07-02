# 🧠 心灵探索 (Mind Explorer)

> 用科学理解心灵，以知识温暖生活 — 心理学知识学习系统

**线上地址**: https://keen-buttercream-697396.netlify.app/

## 快速了解

| 项目 | 说明 |
|------|------|
| **内容** | 96张知识卡片 · 20种心理疾病科普 · 16位心理学家 · 18个经典实验 |
| **技术栈** | 静态 HTML/CSS/JS + GitHub OAuth + Netlify Functions |
| **负责人** | 江江德（GitHub: kangkang-del） |
| **部署** | 推送到 GitHub → Netlify 自动部署 |

## 📂 项目结构

```
├── index.html              # 首页
├── css/style.css           # 全局样式
├── js/auth.js              # 用户认证系统
├── netlify/functions/      # 后端 API（OAuth/积分）
├── study/                  # 知识学习板块
├── health/                 # 心理健康板块
├── theorists/              # 心理学家板块
├── card/                   # 知识卡片详情（1-96）
├── user/                   # 用户系统页面
├── PROJECT-NOTES.md        # ⭐ 完整项目笔记（架构/配置/踩坑/SOP）
└── USER-SYSTEM-GUIDE.md    # 用户系统部署指南
```

## ⚡ AI 协作提示

**如果你是 AI 助手接手此项目，请先读取 `PROJECT-NOTES.md`**，里面包含：

- 完整技术架构和目录说明
- 所有部署配置（Netlify 环境变量、OAuth 回调地址、Git 远程格式）
- 已解决的 9 个踩坑记录及方案
- 待完成功能清单（按优先级排列）
- 日常维护 SOP 和开发注意事项

```bash
# 快速获取项目全貌
curl -s https://raw.githubusercontent.com/kangkang-del/mind-explorer/main/PROJECT-NOTES.md
```

## 📋 当前状态

- ✅ 用户登录系统（GitHub OAuth）
- ✅ 积分系统基础框架
- ✅ 手机端响应式适配（汉堡菜单）
- 🚧 上传功能待真实化
- 🚧 排行榜数据待接入 GitHub API

## 📄 License

本项目内容仅供学习交流使用。
