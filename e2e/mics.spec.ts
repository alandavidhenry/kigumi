import { expect, test } from '@playwright/test'

import { OWNER_STATE, VIEWER_STATE } from './credentials'
import { uniqueSuffix } from './helpers'

// Needs PLATFORM_ADMIN_EMAILS=owner@kigumi.test (see .env.example) and the
// seed, which publishes the starter mics for local use.

test.describe('owner', () => {
  test.use({ storageState: OWNER_STATE })

  test('browses the catalogue and reads a mic page with honest charts', async ({
    page
  }) => {
    await page.goto('/mics')
    await expect(
      page.getByRole('heading', { name: 'Mic catalogue' })
    ).toBeVisible()
    await page.getByLabel('Search microphones').fill('SM57')
    await expect(page).toHaveURL(/q=SM57/)
    await page.getByRole('link', { name: /Shure SM57/ }).click()

    // First visit compiles the route in dev, so allow for it.
    await expect(page).toHaveURL(/\/mics\/shure-sm57$/, { timeout: 30_000 })
    await expect(
      page.getByRole('heading', { name: 'Shure SM57' })
    ).toBeVisible()
    await expect(page.getByText('Specifications')).toBeVisible()
    // The seeded SM57 has a sourced frequency range but no curve data.
    await expect(page.getByText('40 Hz')).toBeVisible()
    await expect(page.getByText('No frequency-response data yet')).toBeVisible()
    // With no measured polar data the plot must say it is idealised.
    await expect(
      page.getByText('Idealised — not measured').first()
    ).toBeVisible()
    await expect(page.getByRole('img', { name: /Polar plot/ })).toBeVisible()
  })

  test('shows the phantom warning on a ribbon mic', async ({ page }) => {
    await page.goto('/mics/coles-4038')
    await expect(
      page.getByRole('alert').filter({ hasText: 'phantom' })
    ).toBeVisible({ timeout: 30_000 })
  })

  test('adds a catalogue mic to the locker, edits it and removes it', async ({
    page
  }) => {
    const serial = `E2E-${uniqueSuffix()}`
    const pair = `pair-${serial}`
    await page.goto('/mics/shure-sm58')
    await page.getByRole('button', { name: 'Add to locker' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Serial number').fill(serial)
    await dialog.getByRole('button', { name: 'Add to locker' }).click()
    await expect(page.getByText(`S/N ${serial}`)).toBeVisible()

    await page.goto('/locker')
    const row = () =>
      page
        .getByText(`S/N ${serial}`)
        .locator('xpath=ancestor::div[contains(@class,"min-h-14")]')
    await row().getByRole('button', { name: 'Edit Shure SM58' }).click()
    await page.getByLabel('Matched pair group').fill(pair)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText(`Matched group · ${pair}`)).toBeVisible()

    await row().getByRole('button', { name: 'Remove Shure SM58' }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Remove' })
      .click()
    await expect(page.getByText(`S/N ${serial}`)).toBeHidden()
  })

  test('platform admin reviews a new mic through to publication', async ({
    page
  }) => {
    const model = `E2E-${uniqueSuffix()}`
    await page.goto('/admin/mics')
    await expect(
      page.getByRole('heading', { name: 'Mic review queue' })
    ).toBeVisible()

    await page.getByRole('button', { name: 'Add microphone' }).click()
    let dialog = page.getByRole('dialog')
    await dialog.getByLabel('Manufacturer').fill('Acme Audio')
    await dialog.getByLabel('Model', { exact: true }).fill(model)
    await dialog.getByLabel('Source URL').fill('https://example.com/spec.pdf')
    await dialog.getByLabel('Document title').fill('Acme spec sheet')
    await dialog.getByRole('button', { name: 'Add microphone' }).click()

    await expect(
      page.getByRole('heading', { name: `Acme Audio ${model}` })
    ).toBeVisible()
    await expect(
      page.getByText('Every populated value has a source.')
    ).toBeVisible()

    // A draft is invisible to the catalogue until it is published.
    await page.getByRole('button', { name: 'Submit for review' }).click()
    const submitted = page.waitForResponse(
      (r) => r.url().includes('/status') && r.request().method() === 'POST'
    )
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Submit for review' })
      .click()
    expect((await submitted).ok()).toBe(true)
    await expect(page.getByText('In review').first()).toBeVisible()

    await page.getByRole('button', { name: 'Publish' }).click()
    dialog = page.getByRole('dialog')
    const published = page.waitForResponse(
      (r) => r.url().includes('/status') && r.request().method() === 'POST'
    )
    await dialog.getByRole('button', { name: 'Publish' }).click()
    expect((await published).ok()).toBe(true)
    await expect(page.getByText('Published', { exact: true })).toBeVisible()

    await page.goto(`/mics?q=${model}`)
    await expect(page.getByText(`Acme Audio ${model}`)).toBeVisible({
      timeout: 15_000
    })
  })
})

test.describe('viewer', () => {
  test.use({ storageState: VIEWER_STATE })

  test('can read the catalogue and locker but not change them', async ({
    page
  }) => {
    await page.goto('/mics?q=SM57')
    await page.getByText('Shure SM57').click()
    await expect(
      page.getByRole('heading', { name: 'Shure SM57' })
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Add to locker' })
    ).toHaveCount(0)

    await page.goto('/locker')
    await expect(
      page.getByRole('heading', { name: 'Mic locker' })
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Add microphone' })
    ).toHaveCount(0)
  })

  test('cannot see or reach the admin review queue', async ({ page }) => {
    await page.goto('/')
    await expect(
      page.getByRole('link', { name: 'Mic review queue' })
    ).toHaveCount(0)
    const response = await page.goto('/admin/mics')
    expect(response?.status()).toBe(404)
    const api = await page.request.get('/api/admin/mics')
    expect(api.status()).toBe(404)
  })
})
