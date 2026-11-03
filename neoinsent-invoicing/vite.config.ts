/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Development: run the API server in one terminal (`npm run server`, i.e. `tsx server/index.ts`)
// and Vite in another (`npm run dev`), then open http://localhost:5173. Vite forwards /api to
// the server. For everyday use, `npm start` builds the app and serves everything on :5174.
const DEV_PORT = 5173
const API_ORIGIN = 'http://127.0.0.1:5174'
const DEV_ORIGINS = new Set([`http://localhost:${DEV_PORT}`, `http://127.0.0.1:${DEV_PORT}`])

export default defineConfig({
  plugins: [react()],
  server: {
    port: DEV_PORT,
    strictPort: true,
    proxy: {
      '/api': {
        target: API_ORIGIN,
        // The server only accepts its own Host/Origin; present dev-server requests as its own.
        // Any other Origin is passed through unchanged so the server still rejects it.
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            if (req.headers.origin && DEV_ORIGINS.has(req.headers.origin)) {
              proxyReq.setHeader('origin', API_ORIGIN)
            }
          })
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Required so RTL's automatic afterEach(cleanup()) registers: @testing-library/react only
    // hooks into a global `afterEach` when one exists, and globals: true is what provides it.
    // Without this, DOM from one test file's render() leaks into the next test.
    globals: true,
  },
})
