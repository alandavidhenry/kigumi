import path from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    fsModuleCache: true,
    setupFiles: ['src/test/setup.ts'],
    // e2e/ holds Playwright specs (npm run test:e2e), not Vitest ones.
    exclude: ['node_modules/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/*.d.ts']
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src')
    }
  }
})
