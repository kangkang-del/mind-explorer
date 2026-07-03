/**
 * StudyInteract - 知识学习列表页点赞/评论交互
 * 依赖: auth.js (Auth 对象)
 * 后端: /.netlify/functions/card-interactions
 */
const StudyInteract = {
  API: '/.netlify/functions/card-interactions',
  BATCH_SIZE: 5,
  currentCardId: null,

  init() {
    const cards = document.querySelectorAll('.knowledge-card[data-card-id]');
    if (!cards.length) return;
    this.loadAllCounts(cards);
    this.bindEvents();
  },

  // 批量并发加载所有卡片的点赞数和评论数
  async loadAllCounts(cards) {
    const cardIds = Array.from(cards).map(c => c.dataset.cardId);
    for (let i = 0; i < cardIds.length; i += this.BATCH_SIZE) {
      const batch = cardIds.slice(i, i + this.BATCH_SIZE);
      await Promise.all(batch.map(id => this.loadCount(id)));
    }
  },

  async loadCount(cardId) {
    try {
      const res = await fetch(`${this.API}?card=${cardId}`);
      if (!res.ok) return;
      const data = await res.json();
      const likeBtn = document.querySelector(`.card-like-btn[data-card-id="${cardId}"]`);
      const commentBtn = document.querySelector(`.card-comment-btn[data-card-id="${cardId}"]`);
      if (likeBtn) {
        likeBtn.querySelector('.like-count').textContent = data.likes || 0;
        if (data.liked) likeBtn.classList.add('liked');
      }
      if (commentBtn) {
        commentBtn.querySelector('.comment-count').textContent = (data.comments || []).length;
      }
    } catch (e) { /* 静默失败 */ }
  },

  bindEvents() {
    // 点赞按钮
    document.addEventListener('click', (e) => {
      const likeBtn = e.target.closest('.card-like-btn');
      if (likeBtn) { e.preventDefault(); this.toggleLike(likeBtn.dataset.cardId); return; }
      const commentBtn = e.target.closest('.card-comment-btn');
      if (commentBtn) { e.preventDefault(); this.openComments(commentBtn.dataset.cardId); return; }
      const closeBtn = e.target.closest('.study-modal-close');
      if (closeBtn) { this.closeModal(); return; }
      const submitBtn = e.target.closest('#study-comment-submit');
      if (submitBtn) { this.submitComment(); return; }
    });

    // 点击遮罩关闭
    const overlay = document.getElementById('study-modal');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.closeModal();
      });
    }
  },

  async toggleLike(cardId) {
    const user = Auth.getUser();
    if (!user) { alert('请先登录后再点赞'); return; }

    const btn = document.querySelector(`.card-like-btn[data-card-id="${cardId}"]`);
    if (!btn) return;
    const isLiked = btn.classList.contains('liked');
    const action = isLiked ? 'unlike' : 'like';

    try {
      const res = await fetch(this.API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card: parseInt(cardId), action })
      });
      if (!res.ok) return;
      const data = await res.json();
      btn.querySelector('.like-count').textContent = data.likes;
      btn.classList.toggle('liked', data.liked);
    } catch (e) { console.error('Like error:', e); }
  },

  async openComments(cardId) {
    const user = Auth.getUser();
    this.currentCardId = cardId;
    const modal = document.getElementById('study-modal');
    const list = document.getElementById('study-comments-list');
    if (!modal || !list) return;

    list.innerHTML = '<p style="text-align:center;color:var(--text-light);">加载中...</p>';
    modal.style.display = 'flex';

    try {
      const res = await fetch(`${this.API}?card=${cardId}`);
      const data = await res.json();
      const comments = data.comments || [];

      if (!comments.length) {
        list.innerHTML = '<p style="text-align:center;color:var(--text-light);">暂无评论，快来抢沙发~</p>';
      } else {
        list.innerHTML = comments.map(c => `
          <div class="community-comment">
            <img class="comment-avatar" src="${c.avatar || ''}" alt="" onerror="this.style.display='none'">
            <div class="comment-body">
              <div class="comment-meta">
                <span class="comment-author">${this.escapeHtml(c.author)}</span>
                <span class="comment-time">${this.fmtTime(c.created_at)}</span>
                ${c.pending ? '<span class="comment-status-tag">待审核</span>' : ''}
              </div>
              <div class="comment-content">${this.escapeHtml(c.content)}</div>
            </div>
          </div>
        `).join('');
      }

      // 显示/隐藏评论输入框
      const form = document.getElementById('study-comment-form');
      if (form) {
        form.style.display = user ? 'block' : 'none';
      }
    } catch (e) {
      list.innerHTML = '<p style="text-align:center;color:var(--danger);">加载失败</p>';
    }
  },

  async submitComment() {
    const user = Auth.getUser();
    if (!user) { alert('请先登录'); return; }
    const input = document.getElementById('study-comment-input');
    if (!input || !this.currentCardId) return;

    const content = input.value.trim();
    if (!content) { alert('评论不能为空'); return; }
    if (content.length > 2000) { alert('评论不能超过2000字'); return; }

    const submitBtn = document.getElementById('study-comment-submit');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await fetch(this.API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card: parseInt(this.currentCardId), action: 'comment', content })
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }

      input.value = '';
      // 刷新评论列表
      this.openComments(this.currentCardId);
      // 更新评论计数
      const commentBtn = document.querySelector(`.card-comment-btn[data-card-id="${this.currentCardId}"]`);
      if (commentBtn && data.comments) {
        commentBtn.querySelector('.comment-count').textContent = data.comments.length;
      }
      if (data.pending) alert('评论已提交，待管理员审核后显示');
    } catch (e) {
      alert('提交失败，请重试');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  },

  closeModal() {
    const modal = document.getElementById('study-modal');
    if (modal) modal.style.display = 'none';
    this.currentCardId = null;
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
};
