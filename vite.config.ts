import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In local dev the API runs as a small Node server (scripts/dev-api.ts) and
// Vite proxies /api to it. On Vercel the same handlers run as functions in api/.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001', '/.well-known': 'http://localhost:3001' },
  },
})
