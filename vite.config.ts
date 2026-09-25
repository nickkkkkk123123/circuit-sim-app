import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Electron 打包态从 file:// 加载，资源必须相对路径
  server: {
    watch: {
      ignored: ['**/.mimosa/**'], // 安全插件的 hook 状态文件频繁增删，会把 watcher 搞崩
    },
  },
})
