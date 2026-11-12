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
        brand: {
          blue: '#7c9cb8',
          green: '#a8d5ba',
          orange: '#f0a868',
          ink: '#3a4a5c',
          sub: '#9aa6b2',
        },
      },
      maxWidth: {
        app: '1200px',
      },
    },
  },
  plugins: [],
}
