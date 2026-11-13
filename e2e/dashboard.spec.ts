import { expect, test } from '@playwright/test'

import { OWNER_STATE } from './credentials'

test.use({ storageState: OWNER_STATE })

// Layout is saved per person, so put it back at the end.
test('the dashboard can be customised: hide a tile, reorder, reset', async ({
  page
}) => {
  await page.goto('/dashboard')
  await expect(page.getByText('Studio and plan usage')).toBeVisible()

  // The counts sit folded at the bottom.
  const usage = page.locator('details', { hasText: 'Studio and plan usage' })
  await expect(usage).not.toHaveAttribute('open', '')

  await page.getByRole('button', { name: 'Customise dashboard' }).click()
  await page.getByRole('button', { name: 'Move Guided wizards down' }).click()
  await page
    .getByRole('button', { name: /^Hide$/ })
    .last()
    .click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Dashboard saved')).toBeVisible()

  await page.reload()
  await expect(page.getByText('Studio and plan usage')).toHaveCount(0)

  await page.getByRole('button', { name: 'Customise dashboard' }).click()
  await page.getByRole('button', { name: 'Reset to default' }).click()
  await expect(page.getByText('Dashboard reset to the default')).toBeVisible()
  await expect(page.getByText('Studio and plan usage')).toBeVisible()
})

test('the guided wizards are one click from the dashboard', async ({
  page
}) => {
  await page.goto('/dashboard')
  await page.getByRole('link', { name: /Plan a session/ }).click()
  await expect(page).toHaveURL(/\/sessions\/new/)
})
