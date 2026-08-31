<template>
  <div v-if="auth.showLoginModal" class="login-modal" @click.self="auth.closeLogin()">
    <div class="login-modal-content">
      <h3>{{ auth.loginMode === 'login' ? '登录' : '注册账号' }}</h3>
      <p class="modal-sub">{{ auth.loginMode === 'login' ? '欢迎回来，继续你的心灵之旅' : '注册后可同步收藏、对话与互动记录' }}</p>

      <button @click="auth.login()" class="github-login-btn">🔗 GitHub 登录</button>
      <div class="divider"><span>或</span></div>

      <input v-model="guestName" :placeholder="guestMode === 'login' ? '昵称' : '设置昵称（至少2位）'" class="guest-input" />
      <input v-if="guestMode === 'register'" v-model="guestDisplay" placeholder="显示名称（可选）" class="guest-input" />
      <input v-model="guestPwd" type="password" :placeholder="guestMode === 'login' ? '密码' : '设置密码（至少6位）'" class="guest-input" @keyup.enter="guestMode === 'login' ? guestSignIn() : guestSignUp()" />

      <button v-if="guestMode === 'login'" @click="guestSignIn" :disabled="busy" class="guest-login-btn">👤 游客登录</button>
      <button v-else @click="guestSignUp" :disabled="busy" class="guest-login-btn">👤 注册并登录</button>

      <p class="login-tip">
        <a href="#" @click.prevent="toggleGuestMode">
          {{ guestMode === 'login' ? '没有账号？去注册' : '已有账号？去登录' }}
        </a>
      </p>
      <button @click="auth.closeLogin()" class="close-btn">关闭</button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const guestMode = ref('login')  // 'login' | 'register'（弹窗内小切换）
const guestName = ref('')
const guestDisplay = ref('')
const guestPwd = ref('')
const busy = ref(false)

// 打开弹窗时同步 store 指定的模式，并清空表单
watch(() => auth.showLoginModal, (v) => {
  if (v) {
    guestMode.value = auth.loginMode === 'register' ? 'register' : 'login'
    guestName.value = ''
    guestDisplay.value = ''
    guestPwd.value = ''
  }
})

function toggleGuestMode() {
  guestMode.value = guestMode.value === 'login' ? 'register' : 'login'
}

async function guestSignUp() {
  if (busy.value) return
  if (guestName.value.trim().length < 2) {
    alert('请输入至少 2 位的昵称')
    return
  }
  if (guestPwd.value.length < 6) {
    alert('密码至少 6 位')
    return
  }
  busy.value = true
  try {
    await auth.guestRegister(guestName.value.trim(), guestPwd.value, guestDisplay.value.trim())
    auth.closeLogin()
  } catch (e) {
    alert(e.message || '注册失败')
  } finally {
    busy.value = false
  }
}

async function guestSignIn() {
  if (busy.value) return
  if (!guestName.value.trim() || !guestPwd.value) {
    alert('请输入昵称和密码')
    return
  }
  busy.value = true
  try {
    await auth.guestLogin(guestName.value.trim(), guestPwd.value)
    auth.closeLogin()
  } catch (e) {
    alert(e.message || '登录失败')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.login-modal {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(30, 45, 60, 0.5); z-index: 2000;
  display: flex; align-items: center; justify-content: center;
}
.login-modal-content {
  background: #fff; border-radius: 16px; padding: 30px 28px;
  width: 330px; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
.login-modal-content h3 { margin: 0 0 6px; color: #3a4a5c; font-size: 18px; }
.modal-sub { margin: 0 0 18px; color: #9aa6b2; font-size: 12px; }
.github-login-btn {
  width: 100%; padding: 12px; border: none; border-radius: 8px;
  background: #24292e; color: #fff; font-size: 15px; cursor: pointer;
  margin-bottom: 14px; transition: opacity 0.2s;
}
.github-login-btn:hover { opacity: 0.9; }
.divider { margin: 12px 0; color: #999; position: relative; font-size: 12px; }
.divider::before { content: ''; position: absolute; left: 0; top: 50%; width: 40%; height: 1px; background: #eef2f7; }
.divider::after { content: ''; position: absolute; right: 0; top: 50%; width: 40%; height: 1px; background: #eef2f7; }
.guest-input {
  width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px;
  margin-bottom: 12px; font-size: 14px; box-sizing: border-box; outline: none;
  transition: border-color 0.2s;
}
.guest-input:focus { border-color: #7c9cb8; }
.guest-login-btn {
  width: 100%; padding: 12px; border: none; border-radius: 8px;
  background: #7c9cb8; color: #fff; font-size: 15px; cursor: pointer;
  margin-bottom: 8px; transition: opacity 0.2s;
}
.guest-login-btn:hover { opacity: 0.9; }
.guest-login-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.login-tip { font-size: 12px; color: #999; margin: 8px 0 14px; }
.login-tip a { color: #7c9cb8; text-decoration: none; }
.close-btn {
  width: 100%; padding: 8px; border: 1px solid #e2e8f0; border-radius: 8px;
  background: #fff; color: #666; cursor: pointer; font-size: 14px;
}
</style>
