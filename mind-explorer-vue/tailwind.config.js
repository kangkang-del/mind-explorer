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
        // ---------- 正式语义 token（《三端手册》分册一 §2）----------
        // 本阶段只「建词表」，不改组件里的硬编码色值；替换在阶段 5 与插画一起做。
        // 映射关系见 docs/design-tokens.md。
        brand: {
          primary: '#345B8E',   // 主品牌蓝：主要按钮、重点文字、选中态
          secondary: '#7C9CB8', // 辅助蓝：导航、图标、辅助强调（沿用线上现有色）
          // ↓ 旧键保留，等阶段 5 全量替换后删除
          blue: '#7c9cb8',
          green: '#a8d5ba',
          orange: '#f0a868',
          ink: '#3a4a5c',
          sub: '#9aa6b2',
        },
        // 文字层级：三端统一墨色
        ink: {
          DEFAULT: '#263746', // 主文字
          muted: '#5A6B7C',   // 次级文字（沿用现网，非手册 token）
          faint: '#9AA6B2',   // 弱文字 / 占位（沿用现网，非手册 token）
        },
        // 紧急 / 风险橙：必须有文字或图标语义，不能只靠颜色
        urgent: {
          DEFAULT: '#D87945',
          soft: '#F0A868', // 底色 / 描边
          ink: '#C2410C',  // 橙块上的深色文字
        },
        // 表面色：桌面与平板暖纸、手机明亮浅白，卡片统一白
        surface: {
          desktop: '#F2F0E8',
          mobile: '#FAFBFD',
          card: '#FFFFFF',
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
