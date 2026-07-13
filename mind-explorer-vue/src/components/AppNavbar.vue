<template>
  <header class="navbar">
    <div class="navbar-inner">
      <RouterLink to="/" class="logo" @click="menuOpen = false">
        <span class="logo-icon">🧠</span>
        <span class="logo-text">心灵探索</span>
      </RouterLink>

      <!-- 移动端汉堡按钮 -->
      <button
        class="menu-toggle"
        :class="{ open: menuOpen }"
        @click="menuOpen = !menuOpen"
        aria-label="切换菜单"
      >
        <span></span><span></span><span></span>
      </button>

      <!-- 主导航 -->
      <nav class="nav-links" :class="{ open: menuOpen }">
        <RouterLink to="/" @click="menuOpen = false">首页</RouterLink>
        <RouterLink to="/knowledge" @click="menuOpen = false">了解心理学知识</RouterLink>
        <RouterLink to="/companion" @click="menuOpen = false">同行者</RouterLink>
        <RouterLink to="/sunny" @click="menuOpen = false">心灵晴天</RouterLink>
        <RouterLink to="/feedback" @click="menuOpen = false">反馈与建议</RouterLink>
        <RouterLink to="/profile" @click="menuOpen = false">个人中心</RouterLink>
      </nav>

      <!-- 用户区 -->
      <div class="user-area">
        <button class="avatar-btn" @click="userMenuOpen = !userMenuOpen">
          <span class="avatar">访客</span>
        </button>
        <div class="user-dropdown" v-if="userMenuOpen" @click="userMenuOpen = false">
          <RouterLink to="/profile" class="dropdown-item">个人中心</RouterLink>
          <RouterLink to="/feedback" class="dropdown-item">反馈与建议</RouterLink>
          <button class="dropdown-item login-btn">登录 / 注册</button>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref } from 'vue'

const menuOpen = ref(false)
const userMenuOpen = ref(false)
</script>

<style scoped>
.navbar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid #eef2f7;
}
.navbar-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 16px;
  height: 60px;
  display: flex;
  align-items: center;
  gap: 16px;
}
.logo {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 18px;
  color: #3a4a5c;
  text-decoration: none;
  white-space: nowrap;
}
.logo-icon { font-size: 22px; }

/* 导航链接 */
.nav-links {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
.nav-links a {
  padding: 8px 12px;
  border-radius: 8px;
  color: #5a6b7c;
  text-decoration: none;
  font-size: 15px;
  transition: all 0.2s;
}
.nav-links a:hover {
  background: #f0f4f9;
  color: #3a4a5c;
}
.nav-links a.router-link-exact-active {
  color: #7c9cb8;
  background: #eef4f9;
  font-weight: 600;
}

/* 用户区 */
.user-area {
  position: relative;
  margin-left: 8px;
}
.avatar-btn {
  border: none;
  background: none;
  cursor: pointer;
  padding: 0;
}
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #7c9cb8, #a8c3d6);
  color: #fff;
  font-size: 13px;
}
.user-dropdown {
  position: absolute;
  right: 0;
  top: 44px;
  min-width: 160px;
  background: #fff;
  border: 1px solid #eef2f7;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  padding: 6px;
  display: flex;
  flex-direction: column;
}
.dropdown-item {
  padding: 8px 12px;
  border-radius: 6px;
  color: #5a6b7c;
  text-decoration: none;
  font-size: 14px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}
.dropdown-item:hover {
  background: #f0f4f9;
  color: #3a4a5c;
}
.login-btn { color: #7c9cb8; font-weight: 600; }

/* 汉堡按钮 */
.menu-toggle {
  display: none;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  width: 36px;
  height: 36px;
  background: none;
  border: none;
  cursor: pointer;
  margin-left: auto;
}
.menu-toggle span {
  display: block;
  width: 22px;
  height: 2px;
  background: #5a6b7c;
  border-radius: 2px;
  transition: all 0.3s;
}
.menu-toggle.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
.menu-toggle.open span:nth-child(2) { opacity: 0; }
.menu-toggle.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

/* 移动端 */
@media (max-width: 860px) {
  .menu-toggle { display: flex; }
  .nav-links {
    position: absolute;
    top: 60px;
    left: 0;
    right: 0;
    flex-direction: column;
    align-items: stretch;
    background: #fff;
    border-bottom: 1px solid #eef2f7;
    padding: 8px 16px;
    gap: 2px;
    transform: translateY(-120%);
    transition: transform 0.3s;
    margin-left: 0;
  }
  .nav-links.open { transform: translateY(0); }
  .nav-links a { padding: 12px; }
  .user-area { margin-left: 0; }
}
</style>
