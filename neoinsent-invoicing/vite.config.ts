/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Required so RTL's automatic afterEach(cleanup()) registers: @testing-library/react only
    // hooks into a global `afterEach` when one exists, and globals: true is what provides it.
    // Without this, DOM from one test file's render() leaks into the next test.
    globals: true,
  },
})
