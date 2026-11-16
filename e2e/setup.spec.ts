import { expect, test } from '@playwright/test'

import { OWNER_STATE } from './credentials'
import { uniqueSuffix } from './helpers'

test.use({ storageState: OWNER_STATE })

// The setup wizard re-runs safely on a seeded organisation: each step saves
// through the normal APIs and can be skipped.
test('the setup wizard adds a room, a mic and a desk, then reaches done', async ({
  page
}) => {
  const suffix = uniqueSuffix()
  await page.goto('/setup?step=rooms')
  await expect(
    page.getByRole('heading', { name: 'Set up your studio' })
  ).toBeVisible()

  await page.getByRole('button', { name: 'Vocal booth' }).click()
  await page.getByLabel('Room name').fill(`Vocal booth ${suffix}`)
  await page.getByLabel('Width').fill('2.5')
  await page.getByLabel('Length').fill('3')
  await page.getByRole('button', { name: 'Add room' }).click()
  await expect(page.getByText(`Vocal booth ${suffix}`)).toBeVisible()

  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/step=mics/)
  await page.getByLabel('Search the catalogue').fill('SM57')
  await page.getByRole('button', { name: /Shure SM57/ }).click()
  await page.getByRole('button', { name: /Add 1 mic to locker/ }).click()
  await expect(page.getByText('Added 1 microphone')).toBeVisible()

  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/step=desk/)
  await page.getByLabel('Console name').fill(`Desk ${suffix}`)
  await expect(page.getByLabel('Desk template')).toContainText(
    'Generic analogue desk'
  )
  await page.getByRole('button', { name: 'Add console' }).click()
  await expect(page.getByText(`Desk ${suffix}`)).toBeVisible()

  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/step=done/)
  await expect(
    page.getByRole('button', { name: /Plan your first session/ })
  ).toBeVisible()
})
