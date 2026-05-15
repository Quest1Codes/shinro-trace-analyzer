import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { DEFAULT_PORT } from '../constants'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${DEFAULT_PORT}`,
        changeOrigin: true,
      },
    },
  },
})
