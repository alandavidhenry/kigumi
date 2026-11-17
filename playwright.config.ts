import { defineConfig, devices } from '@playwright/test'

const port = process.env.PORT ?? '3000'
// NextAuth signs cookies against NEXTAUTH_URL's origin (usually
// http://localhost:3000 in dev) — using 127.0.0.1 here would mismatch it and
// silently break sign-in.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // A dev server compiles each route on first hit, so locally a page can take
  // several seconds to appear. CI runs a built app and keeps the tighter
  // defaults.
  timeout: process.env.CI ? 30_000 : 60_000,
  expect: { timeout: process.env.CI ? 5_000 : 15_000 },
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
  // reuse whatever server is already running on the port, else start one:
  // "npm run dev" by default, or with E2E_BUILT=1 a production build like CI's.
  // The dev server recompiles and hot-reloads the page the first time a route
  // is hit, which can wipe a form mid-test; the built app does not.
  webServer: process.env.CI
    ? undefined
    : {
        command: process.env.E2E_BUILT
          ? 'npm run build && npm run start'
          : 'npm run dev',
        url: baseURL,
        reuseExistingServer: true,
        timeout: process.env.E2E_BUILT ? 300_000 : 120_000,
        // Parallel sign-ins from one address trip the auth rate limiter.
        env: process.env.E2E_BUILT ? { AUTH_RATE_LIMIT: 'off' } : undefined
      }
})
