import { expect, type Page } from '@playwright/test'
import { Client } from 'pg'

export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/auth/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click()
}

export async function expectOnDashboard(page: Page) {
  await page.waitForURL(/\/dashboard$/, { timeout: 15_000 })
  await expect(
    page.getByRole('heading', { name: /Welcome back/ })
  ).toBeVisible()
}

// Email links can't be followed in E2E, so verification is done directly in
// the database the app is running against.
export async function markEmailVerified(email: string) {
  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ??
      'postgresql://kigumi:kigumi@localhost:5433/kigumi'
  })
  await client.connect()
  try {
    await client.query(
      'UPDATE "user" SET "emailVerified" = true WHERE email = $1',
      [email]
    )
  } finally {
    await client.end()
  }
}

export function uniqueSuffix() {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
}
