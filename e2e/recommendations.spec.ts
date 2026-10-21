import { expect, test } from '@playwright/test'

import { OWNER_STATE, VIEWER_STATE } from './credentials'

// Like ai.spec.ts, these never press "Rank and explain with AI": that spends
// real allowance and needs a key. The pipeline is covered by the Vitest route
// tests with a fake provider. The stored recommendation they open is the one
// the dev seed builds (id seed-rec-result) from the real rules code.

const STORED = '/recommendations/seed-rec-result'

test.describe('owner', () => {
  test.use({ storageState: OWNER_STATE })

  test('checks the locker with the rules, labelled as rules-based', async ({
    page
  }) => {
    await page.goto('/recommendations')
    await expect(
      page.getByRole('heading', { name: 'Mic recommendations' })
    ).toBeVisible({ timeout: 30_000 })

    await page.getByLabel('Source 1', { exact: true }).fill('Lead vocal')
    await page.getByRole('button', { name: 'Check my locker' }).click()

    await expect(page.getByText('Rules-based', { exact: true })).toBeVisible()
    await expect(page.getByText('No AI was used.')).toBeVisible()
    // The seeded locker holds a U 87 Ai, a large-diaphragm condenser.
    await expect(page.getByText('Neumann U 87 Ai').first()).toBeVisible()
    await expect(page.getByText(/needs phantom power/).first()).toBeVisible()
    // The model is offered, but not used.
    await expect(
      page.getByRole('button', { name: 'Rank and explain with AI' })
    ).toBeVisible()
  })

  test('works out the type of source from its name and lets it be corrected', async ({
    page
  }) => {
    await page.goto('/recommendations')
    await expect(
      page.getByRole('heading', { name: 'Mic recommendations' })
    ).toBeVisible({ timeout: 30_000 })
    await page.getByLabel('Source 1', { exact: true }).fill('Snare BTM')
    await page.getByRole('button', { name: 'Check my locker' }).click()
    await expect(
      page.locator('p', { hasText: /^Snare drum \(bottom\)$/ })
    ).toBeVisible()
    await expect(
      page
        .getByLabel('Type of source 1', { exact: true })
        .locator('option:checked')
    ).toHaveText('Auto: Snare drum (bottom)')
  })

  test('a preset fills the list, and a line source needs no microphone', async ({
    page
  }) => {
    await page.goto('/recommendations')
    await page.getByRole('button', { name: 'Rock band basics' }).click({
      timeout: 30_000
    })
    await expect(page.getByLabel('Source 4', { exact: true })).toHaveValue(
      'Bass DI'
    )
    await page.getByRole('button', { name: 'Check my locker' }).click()
    await expect(
      page.getByText('Goes straight to a line input. No microphone needed.')
    ).toBeVisible()
  })

  test('shows a stored recommendation with the AI label and the rules’ warnings', async ({
    page
  }) => {
    await page.goto(STORED)
    await expect(page.getByText('AI-generated', { exact: true })).toBeVisible({
      timeout: 30_000
    })
    await expect(page.getByText('Lead vocal').first()).toBeVisible()
    await expect(page.getByText('Neumann U 87 Ai').first()).toBeVisible()
    // The warning text is the rules layer's, not the model's.
    await expect(page.getByText(/needs phantom power/).first()).toBeVisible()
    await expect(page.getByText(/Written by dev-seed/)).toBeVisible()
    // The seeded SM57 inventory row holds six, so it is counted as one.
    await expect(page.getByText(/holds 6/).first()).toBeVisible()
  })

  test('leaves feedback on a source, and it is remembered', async ({
    page
  }) => {
    await page.goto(STORED)
    await expect(page.getByText('AI-generated', { exact: true })).toBeVisible({
      timeout: 30_000
    })
    // The first source on the page is the lead vocal.
    await page.getByRole('button', { name: 'I used this' }).first().click()
    await page.getByRole('button', { name: 'Save feedback' }).first().click()
    await expect(page.getByText('Saved').first()).toBeVisible()

    await page.reload()
    await expect(
      page.getByRole('button', { name: 'I used this' }).first()
    ).toHaveAttribute('aria-pressed', 'true')
  })

  test('lists earlier recommendations and 404s an unknown one', async ({
    page
  }) => {
    await page.goto('/recommendations')
    await expect(
      page.getByRole('link', { name: /Lead vocal, Snare/ })
    ).toBeVisible({ timeout: 30_000 })
    const missing = await page.goto('/recommendations/no-such-recommendation')
    expect(missing?.status()).toBe(404)
  })

  test('the API rejects a bad request and a technique the source cannot use', async ({
    page
  }) => {
    const empty = await page.request.post('/api/recommendations/preview', {
      data: {}
    })
    expect(empty.status()).toBe(400)
    const bad = await page.request.post('/api/recommendations/preview', {
      data: { sources: [{ label: 'Snare', technique: 'decca' }] }
    })
    expect(bad.status()).toBe(400)
  })
})

test.describe('viewer', () => {
  test.use({ storageState: VIEWER_STATE })

  test('can check the locker and read, but cannot ask the AI or leave feedback', async ({
    page
  }) => {
    await page.goto('/recommendations')
    await expect(
      page.getByRole('heading', { name: 'Mic recommendations' })
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByRole('button', { name: 'Rank and explain with AI' })
    ).toHaveCount(0)
    await expect(
      page.getByText(/An engineer, manager or owner can ask the AI/)
    ).toBeVisible()
    await page.getByLabel('Source 1', { exact: true }).fill('Lead vocal')
    await page.getByRole('button', { name: 'Check my locker' }).click()
    await expect(page.getByText('Rules-based', { exact: true })).toBeVisible()

    await page.goto(STORED)
    await expect(page.getByText('AI-generated', { exact: true })).toBeVisible({
      timeout: 30_000
    })
    await expect(page.getByRole('button', { name: 'I used this' })).toHaveCount(
      0
    )
  })

  test('the API refuses to generate or take feedback', async ({ page }) => {
    const create = await page.request.post('/api/recommendations', {
      data: { sources: [{ label: 'Snare' }] }
    })
    expect(create.status()).toBe(403)
    const feedback = await page.request.put(
      '/api/recommendations/seed-rec-result/feedback',
      { data: { sourceKey: 's1', verdict: 'accepted' } }
    )
    expect(feedback.status()).toBe(403)
    const preview = await page.request.post('/api/recommendations/preview', {
      data: { sources: [{ label: 'Snare' }] }
    })
    expect(preview.status()).toBe(200)
  })
})
