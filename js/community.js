/**
 * 心灵探索 - 社区交流模块
 * 展示用户上传的文件，支持认同和评论功能
 * 依赖: auth.js (Auth 对象)
 * 版本: v1.1（添加 Auth 加载保护）
 */

// ===== Auth 可用性检查与自动重载 =====
(function() {
  if (typeof Auth === 'undefined' || typeof Auth.getUser !== 'function') {
    console.log('[Community] Auth not loaded, reloading scripts...');
    document.querySelectorAll('script[src*="auth.js"], script[src*="community.js"]').forEach(s => s.remove());
    var s1 = document.createElement('script');
    s1.src = '/js/auth.js?v=' + Date.now();
    s1.onload = function() {
      var s2 = document.createElement('script');
      s2.src = '/js/community.js?v=' + Date.now();
      document.body.appendChild(s2);
    };
    s1.onerror = function() { console.error('[Community] Failed to load auth.js'); };
    document.body.appendChild(s1);
    return;
  }
})();

const Community = {
  posts: [],
  currentPost: null,
  loading: false,

  // 初始化
  init() {
    console.log('[Community] 初始化社区模块...');
    this.loadPosts();
  },

  // 加载社区内容列表
  async loadPosts() {
    const container = document.getElementById('community-posts');
    if (!container) return;

    container.innerHTML = `
      <div class="community-loading">
        <div class="loading-spinner"></div>
        <p>正在加载社区内容...</p>
      </div>
    `;

    try {
      const res = await fetch('/.netlify/functions/community');
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || '加载失败');
      }

      this.posts = data.posts || [];
      this.renderPosts(container);
    } catch (err) {
      console.error('[Community] 加载失败:', err);
      container.innerHTML = `
        <div class="community-error">
          <p>😅 社区内容加载失败</p>
          <button onclick="Community.loadPosts()" style="margin-top:12px;padding:8px 20px;border:none;background:var(--primary, #A3B5BF);color:#fff;border-radius:8px;cursor:pointer;">重新加载</button>
        </div>
      `;
    }
  },

  // 渲染帖子列表
  renderPosts(container) {
    if (this.posts.length === 0) {
      container.innerHTML = `
        <div class="community-empty">
          <div class="empty-icon">🌱</div>
          <h3>社区还没有内容</h3>
          <p>成为第一个分享者吧！上传你的心理学知识、心得或资源。</p>
          <a href="/user/upload.html" class="btn btn-primary" style="margin-top:16px;">📤 去上传内容</a>
        </div>
      `;
      return;
    }

    // 按更新时间排序（最新的在前）
    const sortedPosts = [...this.posts].sort((a, b) =>
      new Date(b.updated_at) - new Date(a.updated_at)
    );

    let html = '<div class="community-grid">';

    sortedPosts.forEach(post => {
      html += this.renderPostCard(post);
    });

    html += '</div>';
    container.innerHTML = html;

    // 绑定事件
    this.bindEvents();
  },

  // 渲染单个帖子卡片
  renderPostCard(post) {
    const typeIcon = this.getTypeIcon(post.type);
    const typeLabel = this.getTypeLabel(post.type);
    const timeAgo = this.timeAgo(post.created_at);
    const isReacted = post.user_reacted || false;  // 从后端数据初始化认同状态

    // 根据类型渲染不同的内容预览
    let contentPreview = '';
    if (post.type === 'image' && post.image_url) {
      contentPreview = `
        <div class="post-image-preview" onclick="Community.showPostDetail(${post.number})">
          <img src="${this.escapeHtml(post.image_url)}" alt="${this.escapeHtml(post.description)}"
               onerror="this.parentElement.innerHTML='<div class=\\'post-no-image\\'>🖼️ 图片无法显示</div>'">
        </div>
      `;
    } else if (post.type === 'link' && post.url) {
      contentPreview = `
        <a href="${this.escapeHtml(post.url)}" target="_blank" rel="noopener" class="post-link-card">
          <span class="link-icon">🔗</span>
          <span class="link-url">${this.truncateUrl(post.url, 40)}</span>
          <span class="link-arrow">→</span>
        </a>
      `;
    } else if (post.type === 'article') {
      const previewText = post.content ? post.content.slice(0, 120) : post.description;
      contentPreview = `
        <div class="post-content-preview">${previewText ? this.escapeHtml(previewText) + (post.content && post.content.length > 120 ? '...' : '') : ''}</div>
      `;
    }

    return `
      <div class="community-post-card" data-post-number="${post.number}" data-post-type="${post.type}">
        <div class="post-header">
          <span class="post-type-badge ${post.type}">${typeIcon} ${typeLabel}</span>
          <span class="post-time">${timeAgo}</span>
        </div>

        ${contentPreview}

        <h3 class="post-title" onclick="Community.showPostDetail(${post.number})">
          ${this.escapeHtml(post.title)}
        </h3>

        <div class="post-footer">
          <div class="post-author">
            <img src="${this.escapeHtml(post.avatar)}" alt="${this.escapeHtml(post.author_name)}"
                 onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2280%22>👤</text></svg>'"
                 class="post-avatar">
            <span class="post-author-name">${this.escapeHtml(post.author_name)}</span>
          </div>

          <div class="post-stats">
            <button class="post-react-btn ${isReacted ? 'reacted' : ''}" id="react-btn-${post.number}"
                    onclick="Community.toggleReact(${post.number}, event)">
              👍 <span id="react-count-${post.number}">${post.reactions?.thumbsUp || 0}</span>
            </button>
            <button class="post-comment-btn" onclick="Community.showPostDetail(${post.number}, true)">
              💬 <span>${post.comments_count || 0}</span>
            </button>
          </div>
        </div>
      </div>
    `;
  },

  // 绑定事件
  bindEvents() {
    // 这里可以添加更多交互事件
  },

  // 显示帖子详情（含评论区）
  async showPostDetail(postNumber, focusComment = false) {
    const post = this.posts.find(p => p.number === postNumber);
    if (!post) return;

    this.currentPost = post;

    // 创建详情弹窗
    const modal = document.createElement('div');
    modal.className = 'community-modal-overlay';
    modal.id = 'community-modal';
    modal.onclick = (e) => {
      if (e.target === modal) this.closeModal();
    };

    const typeIcon = this.getTypeIcon(post.type);
    const typeLabel = this.getTypeLabel(post.type);

    // 构建评论列表 HTML
    let commentsHtml = '';
    if (post.comments && post.comments.length > 0) {
      commentsHtml = post.comments.map(c => {
        // 检查是否是待审核评论（后端已过滤给非管理员的，但双重保险）
        const isPending = c.content && c.content.startsWith('[PENDING]');
        const displayContent = isPending ? c.content.replace(/^\[PENDING\]\s*/, '') : (c.content || '');
        return `
        <div class="community-comment ${isPending ? 'comment-pending' : ''}" data-comment-id="${c.idStr}">
          <img src="${this.escapeHtml(c.avatar || '')}" alt="${this.escapeHtml(c.author || '匿名用户')}"
               onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2280%22>👤</text></svg>'"
               class="comment-avatar">
          <div class="comment-body">
            <div class="comment-meta">
              <span class="comment-author">${this.escapeHtml(c.author || '匿名用户')}</span>
              ${isPending ? '<span class="comment-status-tag">⏳ 待审核</span>' : ''}
              <span class="comment-time">${this.timeAgo(c.created_at)}</span>
            </div>
            <div class="comment-content">${this.formatCommentContent(displayContent)}</div>
          </div>
        </div>
      `}).join('');
    } else {
      commentsHtml = '<div class="no-comments">暂无评论，来说点什么吧~</div>';
    }

    modal.innerHTML = `
      <div class="community-modal">
        <button class="modal-close-btn" onclick="Community.closeModal()">✕</button>

        <div class="modal-post-info">
          <span class="post-type-badge ${post.type}">${typeIcon} ${typeLabel}</span>
          <h2 class="modal-title">${this.escapeHtml(post.title)}</h2>

          <div class="modal-author-row">
            <img src="${this.escapeHtml(post.avatar)}" alt="${this.escapeHtml(post.author_name)}"
                 onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2280%22>👤</text></svg>'"
                 class="modal-avatar">
            <span class="modal-author-name">${this.escapeHtml(post.author_name)}</span>
            <span class="modal-time">${new Date(post.created_at).toLocaleDateString('zh-CN')}</span>
          </div>

          ${post.type === 'image' && post.image_url ? `
            <div class="modal-image-container">
              <img src="${this.escapeHtml(post.image_url)}" alt="${this.escapeHtml(post.title || post.description)}"
                   onerror="this.style.display='none'">
            </div>
          ` : ''}

          ${post.type === 'article' ? `
            <div class="modal-content">${this.formatCommentContent(post.content)}</div>
          ` : ''}

          ${post.type === 'link' && post.url ? `
            <a href="${this.escapeHtml(post.url)}" target="_blank" rel="noopener" class="modal-link-btn">
              🔗 访问链接 →
            </a>
          ` : ''}
        </div>

        <div class="modal-reactions">
          <button class="modal-react-btn ${post.user_reacted ? 'reacted' : ''}" id="modal-react-btn-${post.number}"
                  onclick="Community.toggleReact(${post.number}, event)">
            👍 认同 (<span id="modal-react-count-${post.number}">${post.reactions?.thumbsUp || 0}</span>)
          </button>
          <span class="modal-stat">💬 ${post.comments_count || 0} 条评论</span>
        </div>

        <div class="modal-comments-section" id="modal-comments-section">
          <h3>💬 评论</h3>
          <div class="comments-list" id="comments-list">
            ${commentsHtml}
          </div>

          <form class="comment-form" onsubmit="Community.submitComment(event, ${postNumber})">
            <textarea id="comment-input-${postNumber}" placeholder="写下你的想法..." rows="3" required></textarea>
            <button type="submit" class="comment-submit-btn" id="comment-submit-btn-${postNumber}">
              📤 发表评论
            </button>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 聚焦到评论框（移动端需处理键盘弹出遮挡）
    if (focusComment) {
      setTimeout(() => {
        const input = document.getElementById(`comment-input-${postNumber}`);
        if (input) {
          input.focus();
          // 移动端：将评论框滚动到可视区域
          if (window.matchMedia('(max-width: 768px)').matches) {
            setTimeout(() => input.scrollIntoView({ behavior: 'smooth', block: 'center' }), 400);
          }
        }
      }, 300);
    }

    // 禁止背景滚动
    document.body.style.overflow = 'hidden';
  },

  // 关闭弹窗
  closeModal() {
    const modal = document.getElementById('community-modal');
    if (modal) {
      modal.remove();
      document.body.style.overflow = '';
    }
  },

  // 切换认同状态
  async toggleReact(postNumber, event) {
    event?.stopPropagation();

    // 检查登录
    if (typeof Auth !== 'undefined' && !Auth.getUser()) {
      alert('请先登录后再进行认同操作');
      Auth.login();
      return;
    }

    // 尝试找到触发事件的按钮（可能是卡片按钮或弹窗按钮）
    let btn = null;
    if (event && event.target) {
      btn = event.target.closest('.post-react-btn') || event.target.closest('.modal-react-btn');
    }
    // 如果通过事件找不到，回退到查找卡片按钮
    if (!btn) {
      btn = document.getElementById(`react-btn-${postNumber}`);
    }

    const countEl = document.getElementById(`react-count-${postNumber}`) ||
                     document.getElementById(`modal-react-count-${postNumber}`);

    if (!btn) return;

    const isCurrentlyActive = btn.classList.contains('reacted');
    const action = isCurrentlyActive ? 'unreact' : 'react';

    // UI 即时反馈
    btn.disabled = true;
    if (isCurrentlyActive) {
      btn.classList.remove('reacted');
      if (countEl) countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
    } else {
      btn.classList.add('reacted');
      if (countEl) countEl.textContent = parseInt(countEl.textContent || 0) + 1;
    }

    try {
      const res = await fetch('/.netlify/functions/community', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: action,
          postNumber: postNumber,
          content: '+1'
        })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || '操作失败');
      }

      // 同步所有相关按钮的状态
      document.querySelectorAll(`[id^="react-btn-"][id$="-${postNumber}"]`).forEach(b => {
        if (!isCurrentlyActive) b.classList.add('reacted');
        else b.classList.remove('reacted');
      });

      console.log('[Community]', action === 'react' ? '已认同' : '已取消认同');
    } catch (err) {
      console.error('[Community] 认同操作失败:', err);
      alert(err.message || '操作失败，请重试');

      // 回滚 UI
      if (isCurrentlyActive) {
        btn.classList.add('reacted');
        if (countEl) countEl.textContent = parseInt(countEl.textContent) + 1;
      } else {
        btn.classList.remove('reacted');
        if (countEl) countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
      }
    } finally {
      btn.disabled = false;
    }
  },

  // 提交评论
  async submitComment(event, postNumber) {
    event.preventDefault();

    // 检查登录
    if (typeof Auth !== 'undefined' && !Auth.getUser()) {
      alert('请先登录后再进行评论');
      Auth.login();
      return;
    }

    const input = document.getElementById(`comment-input-${postNumber}`);
    const submitBtn = document.getElementById(`comment-submit-btn-${postNumber}`);
    const content = input?.value.trim();

    if (!content) {
      alert('评论内容不能为空');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ 发送中...';

    try {
      const res = await fetch('/.netlify/functions/community', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'comment',
          postNumber: postNumber,
          content: content
        })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || '评论发布失败');
      }

      // 根据是否需要审核显示不同提示
      const needsReview = data.pending === true;
      if (needsReview) {
        // 显示待审核提示
        const reviewNotice = document.createElement('div');
        reviewNotice.className = 'pending-notice';
        reviewNotice.textContent = '⏳ 你的评论已提交，等待管理员审核后将在页面显示';
        const form = event.target;
        if (form && form.parentNode) {
          form.parentNode.insertBefore(reviewNotice, form.nextSibling);
          setTimeout(() => reviewNotice.remove(), 5000);
        }
        // 清空输入但不添加到列表
        input.value = '';
      } else {
        // 审核通过（管理员），直接添加到列表
        const commentsList = document.getElementById('comments-list');
        const noComments = commentsList?.querySelector('.no-comments');
        if (noComments) noComments.remove();

        const user = typeof Auth !== 'undefined' ? Auth.getUser() : null;
        const newCommentHtml = `
          <div class="community-comment new-comment">
            <img src="${user ? this.escapeHtml(user.avatar) : ''}" alt="${user ? user.name : '我'}"
                 onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2280%22>👤</text></svg>'"
                 class="comment-avatar">
            <div class="comment-body">
              <div class="comment-meta">
                <span class="comment-author">${user ? this.escapeHtml(user.name) : '我'}</span>
                <span class="comment-time">刚刚</span>
              </div>
              <div class="comment-content">${this.formatCommentContent(content)}</div>
            </div>
          </div>
        `;

        if (commentsList) {
          commentsList.insertAdjacentHTML('beforeend', newCommentHtml);
        }

        // 清空输入框
        input.value = '';

        // 更新本地数据
        const post = this.posts.find(p => p.number === postNumber);
        if (post) {
          post.comments_count = (post.comments_count || 0) + 1;
        }
      }

      console.log('[Community]', needsReview ? '评论已提交，等待审核' : '评论发布成功');
    } catch (err) {
      console.error('[Community] 评论失败:', err);
      alert(err.message || '评论发布失败，请重试');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '📤 发表评论';
    }
  },

  // ===== 工具函数（委托给 Utils，保留快捷引用） =====

  getTypeIcon(type) {
    const icons = { article: '📝', image: '🖼️', link: '🔗', video: '🎬', file: '📄' };
    return icons[type] || '📄';
  },

  getTypeLabel(type) {
    const labels = { article: '文章', image: '图片', link: '链接', video: '视频', file: '文件' };
    return labels[type] || '文件';
  },

  /* 以下方法委托给公共 Utils 模块 */
  timeAgo(dateStr) { return typeof Utils !== 'undefined' ? Utils.timeAgo(dateStr) : dateStr || ''; },
  truncateUrl(url, maxLen) { return typeof Utils !== 'undefined' ? Utils.truncateUrl(url, maxLen) : url || ''; },
  escapeHtml(str) { return typeof Utils !== 'undefined' ? Utils.escapeHtml(str) : str || ''; },
  formatCommentContent(content) { return typeof Utils !== 'undefined' ? Utils.formatCommentContent(content) : content || ''; }
};

// 页面加载时初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Community.init());
} else {
  Community.init();
}
