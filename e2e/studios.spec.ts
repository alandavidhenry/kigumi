import { expect, test } from '@playwright/test'

import { OWNER_STATE, SEEDED_STUDIO_ID } from './credentials'
import { uniqueSuffix } from './helpers'

test.use({ storageState: OWNER_STATE })

test('owner sees the seeded studio and its rooms', async ({ page }) => {
  await page.goto(`/studios/${SEEDED_STUDIO_ID}`)
  await expect(page.getByRole('heading', { name: 'Main studio' })).toBeVisible()
  await expect(page.getByText('Live room')).toBeVisible()
  await expect(page.getByText('7.20 × 9.40 × 4.20 m')).toBeVisible()
})

test('owner can add, edit and delete a room', async ({ page }) => {
  const name = `Booth ${uniqueSuffix()}`
  await page.goto(`/studios/${SEEDED_STUDIO_ID}`)

  await page.getByRole('button', { name: 'Add room' }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Width').fill('2')
  await dialog.getByLabel('Length').fill('2.5')
  await dialog.getByRole('button', { name: 'Add room' }).click()
  await expect(page.getByText(name)).toBeVisible()

  await page.getByRole('button', { name: `Edit ${name}` }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Width').fill('2.4')
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('2.40 × 2.50 m')).toBeVisible()

  await page.getByRole('button', { name: `Delete ${name}` }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText(name)).toHaveCount(0)
})

test('owner sees changes in the activity log', async ({ page }) => {
  await page.goto('/activity')
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
})
