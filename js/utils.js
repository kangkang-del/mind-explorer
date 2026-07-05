/**
 * 心灵探索 - 公共工具函数
 * 统一各模块重复定义的工具方法，避免不一致和维护成本
 * 版本: v1.0
 */

const Utils = {
  // HTML 转义（防 XSS）
  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  // 时间友好显示（相对时间）
  timeAgo(dateStr) {
    if (!dateStr) return '';
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = Math.floor((now - then) / 1000);

    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}天前`;
    return new Date(dateStr).toLocaleDateString('zh-CN');
  },

  // 格式化日期时间为 YYYY-MM-DD HH:mm
  formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
  },

  // 格式化评论内容（换行处理 + 自动链接）
  formatCommentContent(content) {
    if (!content) return '';
    return this.escapeHtml(content)
      .replace(/\n/g, '<br>')
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  },

  // 截断 URL 显示
  truncateUrl(url, maxLen) {
    if (!url) return '';
    url = url.replace(/^https?:\/\/(www\.)?/, '');
    if (url.length <= maxLen) return url;
    return url.slice(0, maxLen) + '...';
  },

  // 默认头像 SVG data URI
  DEFAULT_AVATAR: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="80">👤</text></svg>',

  // 图片加载失败处理（返回统一的 onerror 处理器）
  onAvatarError(el) {
    if (el) el.src = this.DEFAULT_AVATAR;
  }
};
