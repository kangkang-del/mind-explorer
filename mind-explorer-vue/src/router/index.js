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
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
