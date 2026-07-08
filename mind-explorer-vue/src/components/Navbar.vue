<template>
  <nav class="navbar">
    <div class="nav-container">
      <RouterLink to="/" class="nav-brand">心灵探索</RouterLink>
      <button class="nav-toggle" @click="toggleMenu">☰</button>
      <div class="nav-links" :class="{ active: menuOpen }">
        <RouterLink to="/study" class="nav-link">开始学习</RouterLink>
        <RouterLink to="/health" class="nav-link">了解心理</RouterLink>
        <RouterLink to="/community" class="nav-link">社区交流</RouterLink>
        <RouterLink to="/upload" class="nav-link">上传内容</RouterLink>
        <div v-if="auth.isLoggedIn" class="user-menu">
          <RouterLink to="/user/profile" class="user-info">
            <img v-if="auth.user?.avatar" :src="auth.user.avatar" class="user-avatar" />
            <span v-else>👤</span>
            <span>{{ auth.displayName }}</span>
          </RouterLink>
          <button @click="auth.logout()">登出</button>
        </div>
        <button v-else @click="showLoginModal = true" class="login-btn">登录</button>
      </div>
    </div>
  </nav>

  <div v-if="showLoginModal" class="login-modal" @click.self="showLoginModal = false">
    <div class="login-modal-content">
      <h3>{{ guestMode === 'login' ? '游客登录' : '游客注册' }}</h3>

      <button @click="auth.login()" class="github-login-btn">🔗 GitHub 登录</button>
      <div class="divider"><span>或</span></div>

      <input v-model="guestName" :placeholder="guestMode === 'login' ? '昵称' : '设置昵称'" class="guest-input" />
      <input v-if="guestMode === 'register'" v-model="guestDisplay" placeholder="显示名称（可选）" class="guest-input" />
      <input v-model="guestPwd" type="password" :placeholder="guestMode === 'login' ? '密码' : '设置密码（至少6位）'" class="guest-input" @keyup.enter="guestMode === 'login' ? guestSignIn() : guestSignUp()" />

      <button v-if="guestMode === 'login'" @click="guestSignIn" class="guest-login-btn">👤 登录</button>
      <button v-else @click="guestSignUp" class="guest-login-btn">👤 注册并登录</button>

      <p class="login-tip">
        <a href="#" @click.prevent="toggleGuestMode">
          {{ guestMode === 'login' ? '没有账号？去注册' : '已有账号？去登录' }}
        </a>
      </p>
      <button @click="showLoginModal = false" class="close-btn">关闭</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const menuOpen = ref(false)
const showLoginModal = ref(false)
const guestMode = ref('login')  // 'login' | 'register'
const guestName = ref('')
const guestDisplay = ref('')
const guestPwd = ref('')

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

function toggleGuestMode() {
  guestMode.value = guestMode.value === 'login' ? 'register' : 'login'
}

async function guestSignUp() {
  if (!guestName.value.trim()) {
    alert('请输入昵称')
    return
  }
  if (guestPwd.value.length < 6) {
    alert('密码至少 6 位')
    return
  }
  try {
    await auth.guestRegister(guestName.value.trim(), guestPwd.value, guestDisplay.value.trim())
    showLoginModal.value = false
    guestName.value = ''
    guestDisplay.value = ''
    guestPwd.value = ''
    guestMode.value = 'login'
  } catch (e) {
    alert(e.message || '注册失败')
  }
}

async function guestSignIn() {
  if (!guestName.value.trim() || !guestPwd.value) {
    alert('请输入昵称和密码')
    return
  }
  try {
    await auth.guestLogin(guestName.value.trim(), guestPwd.value)
    showLoginModal.value = false
    guestName.value = ''
    guestPwd.value = ''
  } catch (e) {
    alert(e.message || '登录失败')
  }
}

onMounted(() => {
  auth.restoreUser()
  // 监听来自其他页面的"打开登录弹窗"请求
  window.addEventListener('open-login', () => {
    showLoginModal.value = true
  })
})
</script>

<style scoped>
.login-modal {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.5); z-index: 2000;
  display: flex; align-items: center; justify-content: center;
}
.login-modal-content {
  background: #fff; border-radius: 16px; padding: 32px;
  width: 320px; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
.login-modal-content h3 { margin-bottom: 20px; color: #333; }
.github-login-btn {
  width: 100%; padding: 12px; border: none; border-radius: 8px;
  background: #24292e; color: #fff; font-size: 15px; cursor: pointer;
  margin-bottom: 16px; transition: opacity 0.2s;
}
.github-login-btn:hover { opacity: 0.9; }
.divider { margin: 12px 0; color: #999; position: relative; }
.divider::before { content: ''; position: absolute; left: 0; top: 50%; width: 40%; height: 1px; background: #eee; }
.divider::after { content: ''; position: absolute; right: 0; top: 50%; width: 40%; height: 1px; background: #eee; }
.guest-input {
  width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px;
  margin-bottom: 12px; font-size: 14px; box-sizing: border-box;
}
.guest-login-btn {
  width: 100%; padding: 12px; border: none; border-radius: 8px;
  background: #4CAF50; color: #fff; font-size: 15px; cursor: pointer;
  margin-bottom: 8px; transition: opacity 0.2s;
}
.guest-login-btn:hover { opacity: 0.9; }
.login-tip { font-size: 12px; color: #999; margin: 8px 0 16px; }
.close-btn {
  width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 8px;
  background: #fff; color: #666; cursor: pointer; font-size: 14px;
}
.user-info {
  display: flex; align-items: center; gap: 8px;
  text-decoration: none; transition: opacity 0.2s;
}
.user-info:hover { opacity: 0.75; }
</style>
