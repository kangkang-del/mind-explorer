/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  // 关闭 preflight，避免重置 Element Plus 自带样式
  corePlugins: {
    preflight: false,
  },
  theme: {
    // ⚠️ 这里**不要**写 screens 整体覆盖。
    // 曾经的写法 `screens: { md, lg }` 会把默认的 sm/md/lg/xl/2xl 整组替换掉，
    // 导致源码里 12 处 `sm:` 在构建产物中一个都不生成（静默失效），排查成本极高。
    // 现直接采用 Tailwind 默认五档，与《三端手册》分档一致：
    //   sm 640（大屏手机）/ md 768（平板）/ lg 1024（小桌面）/ xl 1280（桌面）/ 2xl 1536
    // 若将来确需新增自定义断点，请用 extend.screens 追加，不要覆盖。
    extend: {
      colors: {
        // ---------- 正式语义 token ----------
        // 依据：《三端手册》分册一 §2 + 项目方 2026-11-12 补充决定。
        // 完整用法见 docs/design-tokens.md。
        brand: {
          // 主品牌蓝：主要按钮、CTA、重要操作、选中状态、重要链接
          primary: '#345B8E',
          // 辅助蓝：地图路径、插画、非关键视觉辅助
          // ⚠️ 不承担小字号正文与主要操作的颜色任务
          secondary: '#7C9CB8',
          // ↓ 旧键保留，等组件全部迁到新 token 后删除
          blue: '#7c9cb8',
          green: '#a8d5ba',
          orange: '#f0a868',
          ink: '#3a4a5c',
          sub: '#9aa6b2',
        },
        // 文字层级：三端统一墨色
        ink: {
          DEFAULT: '#263746', // 主文字
          muted: '#5A6B7C',   // 次级文字：正文、说明、标签一律用它
          decor: '#9AA6B2',   // 仅装饰（图标、分隔线），禁止用于正文/说明/重要标签
        },
        // 紧急 / 风险橙：只有一档，不按号码分级
        urgent: {
          DEFAULT: '#D87945',
          soft: '#F0A868', // 浅暖底 / 描边
        },
        // 表面色：桌面与平板暖纸、手机明亮浅白，卡片统一白
        surface: {
          desktop: '#F2F0E8',
          mobile: '#FAFBFD',
          card: '#FFFFFF',
          brand: { subtle: '#F0F4F9' }, // 选中 / 悬停的浅蓝底
        },
        // 弱边界
        line: {
          subtle: '#E6EAF0',
        },
      },
      maxWidth: {
        app: '1200px',
      },
    },
  },
  plugins: [],
}
