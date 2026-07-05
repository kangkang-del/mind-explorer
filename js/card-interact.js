/**
 * 心灵探索 - 卡片互动（点赞 + 评论 + 审核）
 * 依赖 auth.js 的 Auth 对象
 * 版本: v2.3（修复类型和备用图片问题）
 */
(function() {
  // 检查 Auth 是否可用
  if (typeof Auth === 'undefined' || typeof Auth.getUser !== 'function') {
    console.log('MindExplorer: Auth not loaded, reloading scripts...');
    // 移除可能存在的旧脚本
    document.querySelectorAll('script[src*="auth.js"], script[src*="card-interact.js"]').forEach(s => s.remove());
    // 重新加载 auth.js
    var s1 = document.createElement('script');
    s1.src = '/js/auth.js?v=' + Date.now();
    s1.onload = function() {
      var s2 = document.createElement('script');
      s2.src = '/js/card-interact.js?v=' + Date.now();
      document.body.appendChild(s2);
    };
    s1.onerror = function() {
      console.error('MindExplorer: Failed to load auth.js');
    };
    document.body.appendChild(s1);
    return;
  }
})();

const CardInteract = {
  cardId: null,
  liked: false,
  isAdmin: false,

  init() {
    // 依赖检查
    if (typeof Auth === 'undefined') {
      console.error('MindExplorer: Auth not available');
      return;
    }

    const match = window.location.pathname.match(/\/card\/(\d+)\.html/);
    if (!match) {
      console.log('MindExplorer: Not a card page');
      return;
    }
    this.cardId = match[1];
    console.log('MindExplorer: Initializing for card', this.cardId);

    const container = document.getElementById('card-interact');
    if (!container) {
      console.error('MindExplorer: Container not found');
      return;
    }

    container.innerHTML = '<div class="interact-loading">💬 加载中...</div>';
    this.load();
  },

  async load() {
    try {
      console.log('MindExplorer: Fetching data for card', this.cardId);
      const res = await fetch(`/.netlify/functions/card-interactions?card=${this.cardId}`);
      
      if (!res.ok) {
        console.error('MindExplorer: API returned error', res.status);
        this.renderError();
        return;
      }
      
      const data = await res.json();
      console.log('MindExplorer: Received data', data);
      
      this.liked = data.liked || false;
      this.isAdmin = data.isAdmin || false;
      this.render(data);
    } catch (e) {
      console.error('MindExplorer: Load error', e);
      this.renderError();
    }
  },

  render(data) {
    const user = Auth.getUser();
    const container = document.getElementById('card-interact');
    if (!container) return;

    let html = '<div class="interact-section">';

    // === 点赞按钮 ===
    html += `
      <div class="like-section">
        <button class="like-button ${this.liked ? 'liked' : ''}" id="like-btn" onclick="CardInteract.toggleLike()">
          <span class="like-icon">${this.liked ? '❤️' : '🤍'}</span>
          <span class="like-text">${this.liked ? '已认同' : '认同'}</span>
          <span class="like-count" id="like-count">${data.likes || 0}</span>
        </button>
      </div>
    `;

    // === 评论区 ===
    html += '<div class="comments-section">';
    html += '<h3 class="comments-title">💬 评论</h3>';

    // 管理员审核面板入口提示
    if (this.isAdmin) {
      html += '<div class="admin-hint">🛡️ 管理员模式 · <a href="/admin/review.html">前往审核中心</a></div>';
    }

    // 评论输入框
    if (user) {
      html += `
        <div class="comment-form">
          <img src="${user.avatar}" class="comment-form-avatar" alt="${user.name}" onerror="this.style.display='none'">
          <div class="comment-form-body">
            <textarea class="comment-input" id="comment-input" placeholder="写下你的想法..." rows="3" maxlength="2000"></textarea>
            <div class="comment-form-footer">
              <span class="char-count" id="char-count">0/2000</span>
              <button class="comment-submit" id="comment-submit-btn" onclick="CardInteract.submitComment()">发表评论</button>
            </div>
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="interact-login-prompt">
          <a href="/.netlify/functions/auth-login" class="interact-login-link">🔑 登录后参与互动</a>
        </div>
      `;
    }

    // 评论列表
    const comments = data.comments || [];
    if (comments.length > 0) {
      html += '<div class="comment-list">';
      comments.forEach(c => {
        const isPending = c.status === 'pending';
        // 使用字符串形式的 ID 确保 onclick 传递正确
        const commentId = c.idStr || String(c.id);
        html += `
          <div class="comment-item ${isPending ? 'comment-pending' : ''}" id="comment-${commentId}">
            <img src="${c.avatar}" class="comment-avatar" alt="${c.author}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2280%22>👤</text></svg>'">
            <div class="comment-body">
              <div class="comment-meta">
                <span class="comment-author">${this.escapeHtml(c.author)}</span>
                ${isPending ? '<span class="comment-status-tag">⏳ 待审核</span>' : ''}
                <span class="comment-time">${this.formatTime(c.created_at)}</span>
              </div>
              <div class="comment-text">${this.escapeHtml(c.content)}</div>
              ${isPending && this.isAdmin ? `
                <div class="comment-admin-actions">
                  <button class="comment-approve-btn" onclick="CardInteract.approveComment('${commentId}')">✅ 通过</button>
                  <button class="comment-delete-btn" onclick="CardInteract.deleteComment('${commentId}')">🗑️ 删除</button>
                </div>
              ` : ''}
              ${!isPending && this.isAdmin ? `
                <div class="comment-admin-actions">
                  <button class="comment-delete-btn" onclick="CardInteract.deleteComment('${commentId}')">🗑️ 删除</button>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      });
      html += '</div>';
    } else {
      html += '<div class="comment-empty">还没有评论，来抢沙发吧！</div>';
    }

    html += '</div>';
    html += '</div>';

    container.innerHTML = html;

    // 绑定字数统计
    const input = document.getElementById('comment-input');
    if (input) {
      input.addEventListener('input', () => {
        const count = document.getElementById('char-count');
        if (count) count.textContent = `${input.value.length}/2000`;
      });
    }
  },

  // 切换点赞
  async toggleLike() {
    const user = Auth.getUser();
    if (!user) {
      if (confirm('登录后才能点赞，是否现在登录？')) {
        window.location.href = '/.netlify/functions/auth-login';
      }
      return;
    }

    const button = document.getElementById('like-btn');
    if (button) button.disabled = true;

    try {
      const action = this.liked ? 'unlike' : 'like';
      console.log('MindExplorer: Toggle like', action);

      const res = await fetch('/.netlify/functions/card-interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card: this.cardId, action })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || '操作失败，请重试');
        return;
      }

      const data = await res.json();
      console.log('MindExplorer: Like result', data);
      
      this.liked = data.liked;

      if (button) {
        const icon = button.querySelector('.like-icon');
        const text = button.querySelector('.like-text');
        const count = button.querySelector('.like-count');

        if (this.liked) {
          button.classList.add('liked');
          if (icon) icon.textContent = '❤️';
          if (text) text.textContent = '已认同';
          // 注意：贡献值由后端 card-interactions 统一增加（+0.1），前端不再重复添加
        } else {
          button.classList.remove('liked');
          if (icon) icon.textContent = '🤍';
          if (text) text.textContent = '认同';
        }
        if (count) count.textContent = data.likes || 0;
      }
    } catch (e) {
      console.error('MindExplorer: Like error', e);
      alert('网络错误，请重试');
    } finally {
      if (button) button.disabled = false;
    }
  },

  // 提交评论
  async submitComment() {
    const user = Auth.getUser();
    if (!user) return;

    const input = document.getElementById('comment-input');
    if (!input) return;

    const content = input.value.trim();
    if (!content) {
      alert('请输入评论内容');
      input.focus();
      return;
    }

    const submitBtn = document.getElementById('comment-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '发表中...';
    }

    try {
      const res = await fetch('/.netlify/functions/card-interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card: this.cardId, action: 'comment', content })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || '评论失败，请重试');
        return;
      }

      const data = await res.json();
      input.value = '';
      const count = document.getElementById('char-count');
      if (count) count.textContent = '0/2000';

      // 非管理员显示待审核提示
      if (data.pending) {
        this.showPendingNotice();
      }

      // 重新加载评论
      await this.load();
    } catch (e) {
      console.error('MindExplorer: Comment error', e);
      alert('网络错误，请重试');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '发表评论';
      }
    }
  },

  // 显示待审核提示
  showPendingNotice() {
    const existing = document.getElementById('pending-notice');
    if (existing) existing.remove();

    const notice = document.createElement('div');
    notice.id = 'pending-notice';
    notice.className = 'pending-notice';
    notice.innerHTML = '⏳ 你的评论已提交，等待管理员审核后将在页面显示';
    const form = document.querySelector('.comment-form');
    if (form) form.parentNode.insertBefore(notice, form.nextSibling);

    setTimeout(() => notice.remove(), 5000);
  },

  // 管理员审核通过评论（参数使用字符串）
  async approveComment(commentId) {
    try {
      const res = await fetch('/.netlify/functions/card-interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card: this.cardId, action: 'approve-comment', commentId })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || '操作失败');
        return;
      }

      // 重新加载
      await this.load();
    } catch (e) {
      console.error('MindExplorer: Approve error', e);
      alert('网络错误');
    }
  },

  // 管理员删除评论（参数使用字符串）
  async deleteComment(commentId) {
    if (!confirm('确定删除这条评论？')) return;

    try {
      const res = await fetch('/.netlify/functions/card-interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card: this.cardId, action: 'delete-comment', commentId })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || '操作失败');
        return;
      }

      // 重新加载
      await this.load();
    } catch (e) {
      console.error('MindExplorer: Delete error', e);
      alert('网络错误');
    }
  },

  /* 委托给公共 Utils 模块 */
  formatTime(isoString) { return typeof Utils !== 'undefined' ? Utils.timeAgo(isoString) : isoString || ''; },
  escapeHtml(text) { return typeof Utils !== 'undefined' ? Utils.escapeHtml(text) : text || ''; },

  renderError() {
    const container = document.getElementById('card-interact');
    if (container) {
      container.innerHTML = '<div class="interact-error">加载失败，请 <a href="javascript:location.reload()">刷新页面</a> 或 <a href="javascript:CardInteract.load()">点击重试</a></div>';
    }
  }
};

// 页面加载时初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => CardInteract.init());
} else {
  CardInteract.init();
}
