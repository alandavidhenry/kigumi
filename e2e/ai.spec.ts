import { expect, test } from '@playwright/test'

import { OWNER_STATE, VIEWER_STATE } from './credentials'

// These never press "Generate": that spends real AI allowance and needs an
// API key. The generation pipeline is covered by the Vitest route tests with
// a fake provider.

const COMPARE = '/mics/compare?mics=shure-sm57,shure-sm58'

test.describe('owner', () => {
  test.use({ storageState: OWNER_STATE })

  test('mic page offers an AI summary that is labelled as AI-generated', async ({
    page
  }) => {
    await page.goto('/mics/shure-sm57')
    // First visit compiles the route in dev, so allow for it.
    await expect(page.getByRole('heading', { name: 'Shure SM57' })).toBeVisible(
      { timeout: 30_000 }
    )
    await expect(page.getByText('AI-generated').first()).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Generate AI summary' })
    ).toBeVisible()
    await expect(page.getByText(/AI requests this month/)).toBeVisible()
  })

  test('compares two mics side by side with the differences marked', async ({
    page
  }) => {
    await page.goto(COMPARE)
    await expect(
      page.getByRole('heading', { name: 'Compare microphones' })
    ).toBeVisible({ timeout: 30_000 })
    const table = page.getByRole('table')
    await expect(table.getByRole('link', { name: 'Shure SM57' })).toBeVisible()
    await expect(table.getByRole('link', { name: 'Shure SM58' })).toBeVisible()
    // Only the SM57 has a recorded frequency range in the seed.
    const lowRange = table.getByRole('row', { name: /Frequency range \(low\)/ })
    await expect(lowRange.getByText('Differs')).toBeVisible()
    await expect(lowRange.getByText('Not yet recorded')).toBeVisible()
    await expect(page.getByRole('img', { name: /Polar plot/ })).toHaveCount(2)
    await expect(
      page.getByText('Idealised — not measured').first()
    ).toBeVisible()
    await expect(
      page.getByText('Which to use when', { exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Generate AI comparison' })
    ).toBeVisible()
  })

  test('builds a comparison from the picker and enforces the 2 to 4 limit', async ({
    page
  }) => {
    await page.goto('/mics/compare')
    await expect(
      page.getByText('Choose at least 2 microphones to compare.')
    ).toBeVisible({ timeout: 30_000 })
    await page.getByLabel('Add a microphone').selectOption('shure-sm57')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page).toHaveURL(/mics=shure-sm57$/)
    await page.getByLabel('Add a microphone').selectOption('shure-sm58')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page).toHaveURL(/mics=shure-sm57,shure-sm58$/)
    await expect(page.getByRole('table')).toBeVisible()

    await page.getByRole('button', { name: 'Remove Shure SM58' }).click()
    await expect(page).toHaveURL(/mics=shure-sm57$/)
    await expect(page.getByRole('table')).toHaveCount(0)
  })

  test('404s a comparison that names an unknown mic', async ({ page }) => {
    const response = await page.goto(
      '/mics/compare?mics=shure-sm57,no-such-mic'
    )
    expect(response?.status()).toBe(404)
  })

  test('the AI API rejects bad comparisons', async ({ page }) => {
    const tooFew = await page.request.post('/api/mics/compare', {
      data: { mics: ['shure-sm57'] }
    })
    expect(tooFew.status()).toBe(400)
    const unknown = await page.request.post('/api/mics/compare', {
      data: { mics: ['shure-sm57', 'no-such-mic'] }
    })
    expect(unknown.status()).toBe(404)
  })

  test('shows this month’s AI usage against the plan', async ({ page }) => {
    await page.goto('/settings/organisation')
    await expect(page.getByText('AI requests this month')).toBeVisible({
      timeout: 30_000
    })
    const usage = await page.request.get('/api/ai/usage')
    expect(usage.status()).toBe(200)
    expect((await usage.json()).usage.limit).toBeGreaterThan(0)
  })
})

test.describe('viewer', () => {
  test.use({ storageState: VIEWER_STATE })

  test('can read AI output but not spend the allowance', async ({ page }) => {
    await page.goto(COMPARE)
    await expect(
      page.getByText('Which to use when', { exact: true })
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByRole('button', { name: 'Generate AI comparison' })
    ).toHaveCount(0)
    await expect(
      page.getByText('An engineer, manager or owner can generate one.')
    ).toBeVisible()

    const refused = await page.request.post('/api/mics/shure-sm57/summary')
    expect(refused.status()).toBe(403)
    const refusedCompare = await page.request.post('/api/mics/compare', {
      data: { mics: ['shure-sm57', 'shure-sm58'] }
    })
    expect(refusedCompare.status()).toBe(403)
  })
})
