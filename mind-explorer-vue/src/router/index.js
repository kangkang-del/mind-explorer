import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'

// 新版六大主导航路由（对应顶部导航栏）
const routes = [
  { path: '/', name: 'Home', component: Home, meta: { title: '首页' } },
  { path: '/knowledge', name: 'Knowledge', component: () => import('../views/Knowledge.vue'), meta: { title: '了解心理学知识' } },
  { path: '/companion', name: 'Companion', component: () => import('../views/Companion.vue'), meta: { title: '同行者·小木' } },
  { path: '/mood', name: 'Mood', component: () => import('../views/Mood.vue'), meta: { title: '心情日记' } },
  { path: '/tools', name: 'Tools', component: () => import('../views/Tools.vue'), meta: { title: '自助工具箱' } },
  { path: '/sunny', name: 'Sunny', component: () => import('../views/Sunny.vue'), meta: { title: '心灵晴天' } },
  { path: '/feedback', name: 'Feedback', component: () => import('../views/Feedback.vue'), meta: { title: '反馈与建议' } },
  { path: '/profile', name: 'Profile', component: () => import('../views/Profile.vue'), meta: { title: '个人中心' } },

  // —— 旧版页面路由保留（不在导航显示，便于后续「了解心理学知识」阶段整合）——
  { path: '/study', name: 'Study', component: () => import('../views/Study/Study.vue') },
  { path: '/community', name: 'Community', component: () => import('../views/Community/Community.vue') },
  { path: '/community/:id', name: 'PostDetail', component: () => import('../views/Community/PostDetail.vue'), props: true },
  { path: '/health', name: 'Health', component: () => import('../views/Health/Health.vue') },
  { path: '/health/:slug', name: 'HealthDetail', component: () => import('../views/Health/HealthDetail.vue'), props: true },
  { path: '/card/:id', name: 'CardDetail', component: () => import('../views/Card/CardDetail.vue'), props: true },
  { path: '/user-card/:id', name: 'UserCardDetail', component: () => import('../views/Card/UserCardDetail.vue'), props: true },
  { path: '/upload', name: 'Upload', component: () => import('../views/Upload.vue') },
  { path: '/admin', name: 'Admin', component: () => import('../views/Admin.vue') },

  // 兜底：未匹配路径统一回首页
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  // 与 vite.config.js 的 base 保持一致
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · 心灵探索` : '心灵探索'
})

export default router
