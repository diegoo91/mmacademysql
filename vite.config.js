import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // Project-pages subpath by default; root (/) once CUSTOM_DOMAIN is set
  // (repo variable CUSTOM_DOMAIN=www.mmacademy.com in .github/workflows/deploy.yml).
  base: process.env.CUSTOM_DOMAIN ? '/' : mode === 'production' ? '/mmacademysql/' : '/',
  server: {
    port: 5173,
  },
}))
