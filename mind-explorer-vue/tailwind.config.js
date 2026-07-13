/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  // 关闭 preflight，避免重置 Element Plus 自带样式
  corePlugins: {
    preflight: false,
  },
  theme: {
    // 标准三档断点：手机(默认) / 平板 / 桌面
    screens: {
      md: '768px', // 平板及以上
      lg: '1024px', // 桌面及以上
    },
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
