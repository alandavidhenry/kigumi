import path from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    fsModuleCache: true,
    setupFiles: ['src/test/setup.ts'],
    // e2e/ holds Playwright specs (npm run test:e2e), not Vitest ones;
    // *.db.test.ts need a real database (npm run test:db).
    exclude: ['node_modules/**', 'e2e/**', 'src/**/*.db.test.ts'],
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
