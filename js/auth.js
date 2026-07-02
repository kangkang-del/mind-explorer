/**
 * 心灵探索 - 用户登录系统
 * 基于 GitHub OAuth + Netlify Functions
 */

const Auth = {
  // 从 cookie 解析用户信息
  getUser() {
    const cookies = document.cookie;
    const match = cookies.match(/me_user=([^;]+)/);
    if (!match) return null;
    try {
      return JSON.parse(atob(match[1]));
    } catch (e) {
      return null;
    }
  },

  // 检查是否已登录
  isLoggedIn() {
    return this.getUser() !== null;
  },

  // 获取当前用户
  currentUser() {
    return this.getUser();
  },

  // 判断是否是管理员（仓库拥有者）
  isAdmin() {
    const user = this.getUser();
    return user && user.username === 'kangkang-del';
  },

  // 登录（跳转到 Netlify Function）
  login() {
    window.location.href = '/.netlify/functions/auth-login';
  },

  // 登出
  logout() {
    window.location.href = '/.netlify/functions/auth-logout';
  },

  // 更新页面导航栏的登录状态
  updateNav() {
    const user = this.getUser();
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;

    // 移除旧的登录/用户区域
    const oldUserArea = document.getElementById('nav-user-area');
    if (oldUserArea) oldUserArea.remove();

    const userArea = document.createElement('div');
    userArea.id = 'nav-user-area';
    userArea.className = 'nav-user-area';

    if (user) {
      // 已登录：显示用户头像和昵称
      userArea.innerHTML = `
        <div class="nav-user" onclick="Auth.toggleDropdown()">
          <img src="${user.avatar}" alt="${user.name}" class="nav-avatar">
          <span class="nav-username">${user.name}</span>
          <span class="nav-points" id="nav-points">⭐ --</span>
          <span class="nav-arrow">▾</span>
        </div>
        <div class="nav-dropdown" id="nav-dropdown">
          <a href="/user/profile.html" class="dropdown-item">📋 我的主页</a>
          <a href="/user/upload.html" class="dropdown-item">📤 上传内容</a>
          <a href="/user/points.html" class="dropdown-item">⭐ 我的积分</a>
          ${user.username === 'kangkang-del' ? '<div class="dropdown-divider"></div><a href="/admin/review.html" class="dropdown-item">🛡️ 审核管理</a>' : ''}
          <div class="dropdown-divider"></div>
          <a href="#" class="dropdown-item" onclick="Auth.logout(); return false;">🚪 退出登录</a>
        </div>
      `;
    } else {
      // 未登录：显示登录按钮
      userArea.innerHTML = `
        <button class="nav-login-btn" onclick="Auth.login()">
          🔑 登录 / 注册
        </button>
      `;
    }

    navLinks.appendChild(userArea);

    // 登录后获取积分
    if (user) {
      this.fetchPoints();
    }
  },

  // 切换下拉菜单
  toggleDropdown() {
    const dropdown = document.getElementById('nav-dropdown');
    if (dropdown) {
      dropdown.classList.toggle('active');
    }
  },

  // 获取用户积分
  async fetchPoints() {
    try {
      const res = await fetch('/.netlify/functions/user-points');
      if (res.ok) {
        const data = await res.json();
        const pointsEl = document.getElementById('nav-points');
        if (pointsEl) {
          pointsEl.textContent = `⭐ ${data.points}`;
        }
      }
    } catch (e) {
      console.error('获取积分失败：', e);
    }
  },

  // 增加积分
  async addPoints(delta) {
    try {
      const res = await fetch('/.netlify/functions/user-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta })
      });
      if (res.ok) {
        const data = await res.json();
        const pointsEl = document.getElementById('nav-points');
        if (pointsEl) {
          pointsEl.textContent = `⭐ ${data.points}`;
        }
        return data.points;
      }
    } catch (e) {
      console.error('增加积分失败：', e);
    }
    return null;
  }
};

// 页面加载时更新导航
document.addEventListener('DOMContentLoaded', () => {
  Auth.updateNav();
});

// 点击页面其他地方关闭下拉菜单
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('nav-dropdown');
  const userArea = document.getElementById('nav-user-area');
  if (dropdown && userArea && !userArea.contains(e.target)) {
    dropdown.classList.remove('active');
  }
});
