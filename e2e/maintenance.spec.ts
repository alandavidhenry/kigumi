import { expect, test, type APIRequestContext } from '@playwright/test'

import { OWNER_STATE, SEEDED_EQUIPMENT_ID, VIEWER_STATE } from './credentials'
import { uniqueSuffix } from './helpers'

// Maintenance plans, the service log, PAT testing, warranties with receipts,
// reminders and the dashboard (Phase 7, ADR 0018). Each test creates (and
// removes) its own records so they can run in parallel.

async function createOverduePlan(request: APIRequestContext, title: string) {
  const response = await request.post('/api/maintenance/plans', {
    data: {
      title,
      equipmentItemId: SEEDED_EQUIPMENT_ID,
      intervalDays: 1,
      startsOn: '2020-01-01',
      leadDays: 7
    }
  })
  expect(response.status()).toBe(201)
  return (await response.json()).plan.id as string
}

// A real, minimal PDF header is enough: the server checks the magic bytes.
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')

test.describe('owner', () => {
  test.use({ storageState: OWNER_STATE })

  test('an overdue task can be completed and shows in the service log', async ({
    page,
    request
  }) => {
    const title = `E2E clean ${uniqueSuffix()}`
    const planId = await createOverduePlan(request, title)
    try {
      await page.goto('/maintenance')
      const row = page.getByRole('listitem').filter({ hasText: title })
      await expect(row).toBeVisible({ timeout: 30_000 })
      await expect(row).toContainText('Overdue')

      await row.getByRole('button', { name: 'Complete' }).click()
      await page.getByLabel('Cost (£)').fill('12.50')
      await page.getByLabel('Notes').fill('Cleaned the capsule')
      const completed = page.waitForResponse(
        (r) => r.url().includes('/complete') && r.request().method() === 'POST'
      )
      await page.getByRole('button', { name: 'Mark complete' }).click()
      expect((await completed).status()).toBe(201)

      await page.goto('/maintenance/log')
      const entry = page.getByRole('listitem').filter({ hasText: title })
      await expect(entry.first()).toContainText('£12.50')
      await expect(entry.first()).toContainText('Cleaned the capsule')
    } finally {
      await request.delete(`/api/maintenance/plans/${planId}`)
    }
  })

  test('an invoice can be attached to a log entry', async ({ request }) => {
    const entry = await request.post('/api/maintenance/log', {
      data: {
        equipmentItemId: SEEDED_EQUIPMENT_ID,
        title: `E2E repair ${uniqueSuffix()}`,
        costMinor: 4500
      }
    })
    expect(entry.status()).toBe(201)
    const logId = (await entry.json()).entry.id as string
    try {
      const upload = await request.post(`/api/maintenance/log/${logId}/files`, {
        multipart: {
          file: {
            name: 'invoice.pdf',
            mimeType: 'application/pdf',
            buffer: PDF
          }
        }
      })
      expect(upload.status()).toBe(201)
      const fileId = (await upload.json()).file.id as string

      const download = await request.get(`/api/attachments/${fileId}`)
      expect(download.status()).toBe(200)
      expect(download.headers()['content-type']).toBe('application/pdf')
      expect(download.headers()['x-content-type-options']).toBe('nosniff')

      // Not a PDF, whatever the name says.
      const spoof = await request.post(`/api/maintenance/log/${logId}/files`, {
        multipart: {
          file: {
            name: 'invoice.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from('<script>alert(1)</script>')
          }
        }
      })
      expect(spoof.status()).toBe(400)
    } finally {
      await request.delete(`/api/maintenance/log/${logId}`)
    }
  })

  test('records a PAT test from the register', async ({ page, request }) => {
    await page.goto('/maintenance/pat')
    await expect(
      page.getByRole('heading', { name: 'PAT testing', level: 1 })
    ).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: 'Record test' }).first().click()
    await page.getByLabel('Item').selectOption({ value: SEEDED_EQUIPMENT_ID })
    await page.getByLabel('Certificate / label no.').fill('E2E-LABEL')
    await page.getByRole('button', { name: 'Save' }).click()

    const row = page
      .getByRole('listitem')
      .filter({ hasText: 'E2E-LABEL' })
      .first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(row).toContainText('In date')

    // Leave the register as we found it.
    const tests = await (await request.get('/api/pat')).json()
    for (const test of tests.tests) {
      if (test.reference === 'E2E-LABEL') {
        await request.delete(`/api/pat/${test.id}`)
      }
    }
  })

  test('a warranty with a receipt shows its status on the item page', async ({
    page,
    request
  }) => {
    const soon = new Date(Date.now() + 10 * 86_400_000)
      .toISOString()
      .slice(0, 10)
    const created = await request.post('/api/warranties', {
      data: {
        equipmentItemId: SEEDED_EQUIPMENT_ID,
        endsOn: soon,
        provider: `E2E Provider ${uniqueSuffix()}`
      }
    })
    expect(created.status()).toBe(201)
    const warranty = (await created.json()).warranty
    try {
      const upload = await request.post(
        `/api/warranties/${warranty.id}/files`,
        {
          multipart: {
            file: {
              name: 'receipt.pdf',
              mimeType: 'application/pdf',
              buffer: PDF
            }
          }
        }
      )
      expect(upload.status()).toBe(201)

      await page.goto(`/inventory/${SEEDED_EQUIPMENT_ID}`)
      const card = page
        .getByRole('listitem')
        .filter({ hasText: warranty.provider })
      await expect(card).toBeVisible({ timeout: 30_000 })
      await expect(card).toContainText('Expiring soon')
      await expect(
        card.getByRole('link', { name: 'receipt.pdf' })
      ).toBeVisible()

      await page.goto('/warranties')
      await expect(
        page.getByRole('listitem').filter({ hasText: warranty.provider })
      ).toBeVisible()
    } finally {
      await request.delete(`/api/warranties/${warranty.id}`)
    }
  })

  test('the dashboard surfaces what needs attention', async ({
    page,
    request
  }) => {
    const title = `E2E dash ${uniqueSuffix()}`
    const planId = await createOverduePlan(request, title)
    try {
      await page.goto('/dashboard')
      await expect(
        page.getByRole('heading', { name: /Welcome back/ })
      ).toBeVisible({ timeout: 30_000 })
      await expect(
        page.getByText('Upcoming sessions', { exact: true })
      ).toBeVisible()
      await expect(page.getByText(title).first()).toBeVisible()
      await expect(
        page.getByText('Expiring warranties', { exact: true })
      ).toBeVisible()
    } finally {
      await request.delete(`/api/maintenance/plans/${planId}`)
    }
  })

  test('the reminders page opens from the top bar', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByRole('link', { name: /^Reminders/ }).click()
    await expect(page).toHaveURL(/\/notifications$/)
    await expect(
      page.getByRole('heading', { name: 'Reminders', level: 1 })
    ).toBeVisible()
  })

  test('the cron route refuses a request without the secret', async ({
    request
  }) => {
    const response = await request.post('/api/cron/reminders')
    expect(response.status()).toBe(401)
  })
})

test.describe('viewer', () => {
  test.use({ storageState: VIEWER_STATE })

  test('can read maintenance and warranties but not change them', async ({
    page,
    request
  }) => {
    await page.goto('/maintenance/plans')
    await expect(
      page.getByRole('heading', { name: 'Maintenance plans' })
    ).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'New plan' })).toHaveCount(0)

    await page.goto('/warranties')
    await expect(
      page.getByRole('heading', { name: 'Warranties', level: 1 })
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Add warranty' })
    ).toHaveCount(0)

    const plan = await request.post('/api/maintenance/plans', {
      data: {
        title: 'Nope',
        equipmentItemId: SEEDED_EQUIPMENT_ID,
        intervalDays: 30
      }
    })
    expect(plan.status()).toBe(403)
    const warranty = await request.post('/api/warranties', {
      data: { equipmentItemId: SEEDED_EQUIPMENT_ID, endsOn: '2030-01-01' }
    })
    expect(warranty.status()).toBe(403)
  })
})
