import path from 'node:path'

import { defineConfig } from 'vitest/config'

// Real-database suite (npm run test:db): needs Postgres (npm run docker:up).
// The database named by TEST_DATABASE_URL (default kigumi_test on the
// docker-compose Postgres) is dropped and recreated on every run.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.db.test.ts'],
    globalSetup: ['src/test/db/global-setup.ts'],
    setupFiles: ['src/test/db/setup.ts'],
    // One shared database: run files one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src')
    }
  }
})
