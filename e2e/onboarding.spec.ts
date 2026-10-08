import { expect, test } from '@playwright/test'

import { markEmailVerified, signIn, uniqueSuffix } from './helpers'

// Full self-service path: sign up → verify → create organisation + studio →
// add a room. Uses a fresh account so it starts on the Free plan.
test('a new user can set up their organisation, studio and first room', async ({
  page
}) => {
  const suffix = uniqueSuffix()
  const email = `new-${suffix}@kigumi.test`
  const password = 'new-user-password'

  await page.goto('/auth/sign-up')
  await page.getByLabel('Your name').fill('New Engineer')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(
    page.getByRole('heading', { name: 'Check your inbox' })
  ).toBeVisible()

  await markEmailVerified(email)
  await signIn(page, email, password)

  // No organisation yet, so the app sends them to onboarding.
  await page.waitForURL(/\/onboarding$/)
  await page.getByLabel('Organisation name').fill(`Studio ${suffix}`)
  await page.getByLabel('First studio (optional)').fill('Garden studio')
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.waitForURL(/\/dashboard$/)
  await expect(page.getByText(`Studio ${suffix} · Free plan`)).toBeVisible()

  await page.goto('/studios')
  await page.getByRole('link', { name: /Garden studio/ }).click()
  await page.getByRole('button', { name: 'Add room' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill('Live room')
  await dialog.getByLabel('Width').fill('6.5')
  await dialog.getByLabel('Length').fill('8')
  await dialog.getByLabel('Height').fill('3.2')
  await dialog.getByRole('button', { name: 'Add room' }).click()

  await expect(page.getByText('6.50 × 8.00 × 3.20 m')).toBeVisible()

  // Free plan allows one room, so adding another is blocked.
  await expect(page.getByRole('button', { name: 'Add room' })).toBeDisabled()
  await expect(
    page.getByText('You’ve reached your plan’s room limit.')
  ).toBeVisible()
})
