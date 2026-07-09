import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'

const routes = [
  { path: '/', name: 'Home', component: Home },
  { path: '/card/:id', name: 'CardDetail', component: () => import('../views/Card/CardDetail.vue'), props: true },
  { path: '/community', name: 'Community', component: () => import('../views/Community/Community.vue') },
  { path: '/community/:id', name: 'PostDetail', component: () => import('../views/Community/PostDetail.vue'), props: true },
  { path: '/study', name: 'Study', component: () => import('../views/Study/Study.vue') },
  { path: '/health', name: 'Health', component: () => import('../views/Health/Health.vue') },
  { path: '/health/:slug', name: 'HealthDetail', component: () => import('../views/Health/HealthDetail.vue'), props: true },
  { path: '/user/profile', name: 'UserProfile', component: () => import('../views/User/Profile.vue') },
  { path: '/upload', name: 'Upload', component: () => import('../views/Upload.vue') },
  { path: '/admin', name: 'Admin', component: () => import('../views/Admin.vue') },
  { path: '/user-card/:id', name: 'UserCardDetail', component: () => import('../views/Card/UserCardDetail.vue'), props: true },
  // 兜底：未匹配路径统一回首页，避免 RouterView 空白
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  // 必须与 vite.config.js 的 base 保持一致，否则带 base 部署/本地运行时
  // 访问 /mind-explorer/ 会因路径不匹配而渲染空白（RouterView 为空）
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

export default router
