import { expect, test } from './fixtures'
import { markEmailVerified, signIn, uniqueSuffix } from './helpers'

// Uses a fresh account so the seeded users keep their names and passwords.
test('a user can rename themselves, change their password and is stopped from deleting as the sole owner', async ({
  page
}) => {
  const suffix = uniqueSuffix()
  const email = `account-${suffix}@kigumi.test`
  const password = 'account-password-1'
  const newPassword = 'account-password-2'

  await page.goto('/auth/sign-up')
  await page.getByLabel('Your name').fill('Account Tester')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(
    page.getByRole('heading', { name: 'Check your inbox' })
  ).toBeVisible()
  await markEmailVerified(email)
  await signIn(page, email, password)

  await page.waitForURL(/\/onboarding$/)
  await page.getByLabel('Organisation name').fill(`Account ${suffix}`)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL(/\/setup/)
  await page.getByRole('button', { name: 'Skip setup for now' }).click()
  await page.waitForURL(/\/dashboard$/)

  await page.goto('/settings/account')
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible()

  // Rename.
  await page.getByLabel('Name', { exact: true }).fill('Renamed Tester')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Name updated', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
    'Renamed Tester'
  )

  // The only owner of an organisation cannot delete their account.
  await expect(page.getByText(/only owner of/)).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Delete my account' })
  ).toBeDisabled()

  // A wrong current password is refused.
  await page.getByLabel('Current password').fill('not-my-password')
  await page.getByLabel('New password', { exact: true }).fill(newPassword)
  await page.getByLabel('Confirm new password').fill(newPassword)
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByRole('alert')).toBeVisible()

  // The right one works, and the new password signs in.
  await page.getByLabel('Current password').fill(password)
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(
    page.getByText('Password changed', { exact: true })
  ).toBeVisible()

  await page.context().clearCookies()
  await signIn(page, email, newPassword)
  await page.waitForURL(/\/dashboard$/)
})
