/**
 * 心灵探索 - 卡片互动（点赞 + 评论）
 * 依赖 auth.js 的 Auth 对象
 */
const CardInteract = {
  cardId: null,
  liked: false,

  init() {
    // 从 URL 提取卡片 ID（如 /card/75.html → 75）
    const match = window.location.pathname.match(/\/card\/(\d+)\.html/);
    if (!match) return;
    this.cardId = match[1];

    const container = document.getElementById('card-interact');
    if (!container) return;

    container.innerHTML = '<div class="interact-loading">💬 加载中...</div>';
    this.load();
  },

  // 加载互动数据
  async load() {
    try {
      const res = await fetch(`/.netlify/functions/card-interactions?card=${this.cardId}`);
      if (res.ok) {
        const data = await res.json();
        this.liked = data.liked;
        this.render(data);
      } else {
        this.renderError();
      }
    } catch (e) {
      this.renderError();
    }
  },

  // 渲染互动区
  render(data) {
    const user = Auth.getUser();
    const container = document.getElementById('card-interact');
    if (!container) return;

    let html = '<div class="interact-section">';

    // === 点赞按钮 ===
    html += `
      <div class="like-section">
        <button class="like-button ${this.liked ? 'liked' : ''}" onclick="CardInteract.toggleLike()" ${!user ? 'data-need-login="1"' : ''}>
          <span class="like-icon">${this.liked ? '❤️' : '🤍'}</span>
          <span class="like-text">${this.liked ? '已认同' : '认同'}</span>
          <span class="like-count">${data.likes || 0}</span>
        </button>
      </div>
    `;

    // === 评论区 ===
    html += '<div class="comments-section">';
    html += '<h3 class="comments-title">💬 评论</h3>';

    // 评论输入框
    if (user) {
      html += `
        <div class="comment-form">
          <img src="${user.avatar}" class="comment-form-avatar" alt="${user.name}">
          <div class="comment-form-body">
            <textarea class="comment-input" id="comment-input" placeholder="写下你的想法..." rows="3" maxlength="2000"></textarea>
            <div class="comment-form-footer">
              <span class="char-count" id="char-count">0/2000</span>
              <button class="comment-submit" onclick="CardInteract.submitComment()">发表评论</button>
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
    if (data.comments && data.comments.length > 0) {
      html += '<div class="comment-list">';
      data.comments.forEach(c => {
        html += `
          <div class="comment-item">
            <img src="${c.avatar}" class="comment-avatar" alt="${c.author}" loading="lazy">
            <div class="comment-body">
              <div class="comment-meta">
                <span class="comment-author">${this.escapeHtml(c.author)}</span>
                <span class="comment-time">${this.formatTime(c.created_at)}</span>
              </div>
              <div class="comment-text">${this.escapeHtml(c.content)}</div>
            </div>
          </div>
        `;
      });
      html += '</div>';
    } else {
      html += '<div class="comment-empty">还没有评论，来抢沙发吧！</div>';
    }

    html += '</div>'; // comments-section
    html += '</div>'; // interact-section

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

    const button = document.querySelector('.like-button');
    if (button) button.disabled = true;

    try {
      const action = this.liked ? 'unlike' : 'like';
      const res = await fetch('/.netlify/functions/card-interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card: this.cardId, action })
      });

      if (res.ok) {
        const data = await res.json();
        this.liked = data.liked;

        // 更新按钮 UI
        if (button) {
          const icon = button.querySelector('.like-icon');
          const text = button.querySelector('.like-text');
          const count = button.querySelector('.like-count');

          if (this.liked) {
            button.classList.add('liked');
            if (icon) icon.textContent = '❤️';
            if (text) text.textContent = '已认同';
            // 点赞获得 +1 积分
            await Auth.addPoints(1);
          } else {
            button.classList.remove('liked');
            if (icon) icon.textContent = '🤍';
            if (text) text.textContent = '认同';
          }
          if (count) count.textContent = data.likes;
        }
      }
    } catch (e) {
      console.error('点赞失败:', e);
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
      input.focus();
      return;
    }

    const submitBtn = document.querySelector('.comment-submit');
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

      if (res.ok) {
        input.value = '';
        const count = document.getElementById('char-count');
        if (count) count.textContent = '0/2000';
        // 重新加载评论
        this.load();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || '评论失败，请重试');
      }
    } catch (e) {
      alert('网络错误，请重试');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '发表评论';
      }
    }
  },

  // 格式化时间
  formatTime(isoString) {
    if (!isoString) return '';
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diff = Math.floor((now - then) / 1000);

    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}天前`;
    return new Date(isoString).toLocaleDateString('zh-CN');
  },

  // HTML 转义
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // 渲染错误
  renderError() {
    const container = document.getElementById('card-interact');
    if (container) {
      container.innerHTML = '<div class="interact-error">加载失败，<a href="javascript:CardInteract.load()">点击重试</a></div>';
    }
  }
};

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
  CardInteract.init();
});
