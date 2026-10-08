import { expect, test } from '@playwright/test'

import { ownerCredentials } from './credentials'
import { signIn } from './helpers'

test.describe('sign-in', () => {
  test('redirects signed-out visitors from app pages to sign-in', async ({
    page
  }) => {
    await page.goto('/studios')
    await expect(page).toHaveURL(/\/auth\/sign-in\?callbackUrl=%2Fstudios/)
    await expect(
      page.getByRole('heading', { name: 'Sign in to Kigumi' })
    ).toBeVisible()
  })

  test('rejects a wrong password', async ({ page }) => {
    await signIn(page, ownerCredentials.email, 'definitely-wrong-password')
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page).toHaveURL(/\/auth\/sign-in/)
  })

  test('returns to the requested page after signing in', async ({ page }) => {
    await page.goto('/studios')
    await page.getByLabel('Email').fill(ownerCredentials.email)
    await page
      .getByLabel('Password', { exact: true })
      .fill(ownerCredentials.password)
    await page.locator('form').getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/studios$/)
    await expect(
      page.getByRole('heading', { name: 'Studios & rooms' })
    ).toBeVisible()
  })
})
