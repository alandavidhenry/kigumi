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

  await page.getByRole('button', { name: 'Add room' }).click()
  const second = page.getByRole('dialog')
  await second.getByLabel('Name').fill('Control room')
  await second.getByLabel('Width').fill('4')
  await second.getByLabel('Length').fill('5')
  await second.getByRole('button', { name: 'Add room' }).click()
  await expect(page.getByText('4.00 × 5.00 m')).toBeVisible()

  // Free allows two rooms; the third is blocked with an upgrade prompt.
  await expect(page.getByRole('button', { name: 'Add room' })).toBeDisabled()
  await expect(
    page.getByText('You’ve reached your plan’s room limit.')
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'See Pro plan' })).toBeVisible()
})

test.describe('Free plan upgrade prompts', () => {
  test('a Free owner sees paid features as upgrade prompts', async ({
    page
  }) => {
    const suffix = uniqueSuffix()
    const email = `free-${suffix}@kigumi.test`
    const password = 'free-user-password'

    await page.goto('/auth/sign-up')
    await page.getByLabel('Your name').fill('Solo Engineer')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(
      page.getByRole('heading', { name: 'Check your inbox' })
    ).toBeVisible()
    await markEmailVerified(email)
    await signIn(page, email, password)
    await page.waitForURL(/\/onboarding$/)
    await page.getByLabel('Organisation name').fill(`Solo ${suffix}`)
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.waitForURL(/\/dashboard$/)

    // The activity log is a Studio feature: visible, but as an upgrade prompt.
    await page.goto('/activity')
    await expect(page.getByText('See who changed what, and when')).toBeVisible()
    await expect(page.getByRole('table')).toHaveCount(0)
    expect((await page.request.get('/api/audit-log')).status()).toBe(403)

    // Free includes one seat, so inviting is blocked.
    await page.goto('/settings/members')
    await expect(page.getByRole('button', { name: 'Invite' })).toBeDisabled()
    await expect(
      page.getByText('All seats on your plan are in use')
    ).toBeVisible()

    // The plans comparison marks the current plan.
    await page.goto('/settings/organisation')
    await expect(
      page.getByRole('region', { name: 'Free plan' }).getByText('Current plan')
    ).toBeVisible()
    await expect(page.getByRole('region', { name: 'Pro plan' })).toContainText(
      'Insurance & valuation report'
    )
  })
})
