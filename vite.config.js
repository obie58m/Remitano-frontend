import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

const apiTarget = process.env.VITE_PROXY_API || 'http://127.0.0.1:3000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/cable': { target: apiTarget, ws: true, changeOrigin: true },
      '/up': { target: apiTarget, changeOrigin: true },
    },
  },
})
