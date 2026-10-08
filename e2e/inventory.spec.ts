import { expect, test } from '@playwright/test'

import { OWNER_STATE, SEEDED_EQUIPMENT_ID, VIEWER_STATE } from './credentials'
import { uniqueSuffix } from './helpers'

test.describe('owner', () => {
  test.use({ storageState: OWNER_STATE })

  test('can add, edit, search and delete an item', async ({ page }) => {
    const model = `Test-${uniqueSuffix()}`
    await page.goto('/inventory')
    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible()
    await expect(page.getByText('Neumann U 87 Ai')).toBeVisible()

    await page.getByRole('button', { name: 'Add item' }).click()
    let dialog = page.getByRole('dialog')
    await dialog.getByLabel('Make').fill('Acme')
    await dialog.getByLabel('Model').fill(model)
    await dialog.getByLabel('Price each').fill('120.50')
    await dialog.getByRole('button', { name: 'Add item' }).click()

    await page.getByLabel('Search equipment').fill(model)
    await expect(page).toHaveURL(/q=/)
    await page.getByText(`Acme ${model}`).click()
    await expect(
      page.getByRole('heading', { name: `Acme ${model}` })
    ).toBeVisible()
    await expect(page.getByText('£120.50')).toBeVisible()

    await page.getByRole('button', { name: 'Edit' }).click()
    dialog = page.getByRole('dialog')
    await dialog.getByLabel('Serial number').fill('SN-42')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('S/N SN-42').first()).toBeVisible()

    await page.getByRole('button', { name: 'Delete' }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete' })
      .click()
    await expect(page).toHaveURL(/\/inventory$/)
  })

  test('shows the QR label and the valuation report', async ({ page }) => {
    await page.goto(`/inventory/${SEEDED_EQUIPMENT_ID}`)
    await expect(page.getByText('Asset label')).toBeVisible()

    await page.goto('/inventory/valuation')
    await expect(
      page.getByRole('heading', { name: 'Valuation report' })
    ).toBeVisible()
    await expect(
      page.getByRole('cell', { name: /Neumann U 87 Ai/ })
    ).toBeVisible()
  })

  test('exports CSV', async ({ page }) => {
    const response = await page.request.get('/api/equipment/export')
    expect(response.status()).toBe(200)
    expect(await response.text()).toContain('category,make,model')
  })
})

test.describe('viewer', () => {
  test.use({ storageState: VIEWER_STATE })

  test('can read inventory but has no edit controls', async ({ page }) => {
    await page.goto('/inventory')
    await expect(page.getByText('Neumann U 87 Ai')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add item' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Import CSV' })).toHaveCount(
      0
    )
  })

  test('is refused by the API', async ({ page }) => {
    const response = await page.request.post('/api/equipment', {
      data: { category: 'cable', make: 'A', model: 'B' }
    })
    expect(response.status()).toBe(403)
  })
})
