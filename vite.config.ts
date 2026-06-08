import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: '/template-extrat/',
  build: {
    outDir: 'template-extrat',
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://172.16.7.53:8200',
        // target: 'http://192.168.113.94:8200',
        changeOrigin: true,
      },
    },
  },
})
