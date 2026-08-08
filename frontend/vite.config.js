import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8015',
      '/downloads': 'http://127.0.0.1:8015',
      '/logos': 'http://127.0.0.1:8015',
    }
  }
})
