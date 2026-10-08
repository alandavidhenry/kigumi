import { expect, test } from '@playwright/test'

import { SEEDED_STUDIO_ID, VIEWER_STATE } from './credentials'

test.use({ storageState: VIEWER_STATE })

test('viewer can read studios but has no edit controls', async ({ page }) => {
  await page.goto(`/studios/${SEEDED_STUDIO_ID}`)
  await expect(page.getByRole('heading', { name: 'Main studio' })).toBeVisible()
  await expect(page.getByText('Live room')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add room' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0)
})

test('viewer is refused by the API even without the UI', async ({ page }) => {
  const response = await page.request.post('/api/studios', {
    data: { name: 'Sneaky studio' }
  })
  expect(response.status()).toBe(403)
})

test('viewer cannot open the activity log', async ({ page }) => {
  await page.goto('/activity')
  await expect(page).toHaveURL(/\/dashboard$/)
})
