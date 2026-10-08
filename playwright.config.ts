import { defineConfig, devices } from '@playwright/test'

const port = process.env.PORT ?? '3000'
// NextAuth signs cookies against NEXTAUTH_URL's origin (usually
// http://localhost:3000 in dev) — using 127.0.0.1 here would mismatch it and
// silently break sign-in.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup']
    }
  ],
  // In CI, the server is built and started by a workflow step before Playwright
  // runs, against seeded data — reusing it there would race the seed. Locally,
  // reuse whatever dev server is already running on the port.
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000
      }
})
