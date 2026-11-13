import { expect, test, type APIRequestContext } from '@playwright/test'

import { OWNER_STATE, VIEWER_STATE } from './credentials'
import { uniqueSuffix } from './helpers'

// Consoles, per-session recall sheets, outboard and copying a previous recall
// (Phase 6, ADR 0017). Tests create their own consoles and sessions so they can
// run in parallel; the seeded session is only duplicated.

const SEEDED_SESSION = 'seed-session-tracking'

async function createConsole(request: APIRequestContext) {
  const response = await request.post('/api/consoles', {
    data: {
      name: `E2E desk ${uniqueSuffix()}`,
      channelCount: 24,
      builtinTemplateId: 'generic-analogue'
    }
  })
  expect(response.status()).toBe(201)
  return (await response.json()).console.id as string
}

// A copy of the seeded session: it already has inputs from its layout.
async function sessionWithInputs(request: APIRequestContext) {
  const response = await request.post(
    `/api/sessions/${SEEDED_SESSION}/duplicate`
  )
  expect(response.status()).toBe(201)
  return (await response.json()).session.id as string
}

test.describe('owner', () => {
  test.use({ storageState: OWNER_STATE })

  test('builds a recall sheet from the input list, records a strip and an outboard unit, then prints it', async ({
    page,
    request
  }) => {
    const consoleId = await createConsole(request)
    const sessionId = await sessionWithInputs(request)

    await page.goto(`/sessions/${sessionId}/recall`)
    await expect(
      page.getByRole('heading', { name: 'Recall sheet', exact: true })
    ).toBeVisible({
      timeout: 30_000
    })
    await page.getByRole('button', { name: 'Create recall sheet' }).click()

    // The desk view is the default; the list view is its keyboard twin.
    await expect(page.getByTestId('desk-canvas')).toBeVisible({
      timeout: 30_000
    })
    await page.getByRole('button', { name: 'List', exact: true }).click()

    // The strips come from the input list: strip 1 exists with its source.
    const strip = page.locator('details').first()
    await expect(strip).toBeVisible({ timeout: 30_000 })
    await expect(strip).toContainText('Source Mic')
    await strip.locator('summary').click()

    await page.getByLabel('Gain for strip 1', { exact: true }).fill('32')
    await page.getByLabel('Fader for strip 1').fill('-6')
    const saved = page.waitForResponse(
      (r) =>
        r.url().includes('/recall/channels/') &&
        r.request().method() === 'PATCH'
    )
    await page.getByRole('button', { name: 'Save strip 1' }).click()
    expect((await saved).status()).toBe(200)

    await page.reload()
    await page
      .getByRole('button', { name: 'List', exact: true })
      .click({ timeout: 30_000 })
    await expect(page.locator('details').first()).toContainText('Gain 32 dB')
    await expect(page.locator('details').first()).toContainText('Fader -6 dB')

    // Outboard.
    await page.getByLabel('Name', { exact: true }).fill('LA-2A')
    await page.getByRole('button', { name: 'Add outboard unit' }).click()
    await expect(page.getByLabel('Outboard unit name for LA-2A')).toBeVisible({
      timeout: 30_000
    })
    await page.getByRole('button', { name: 'Add setting' }).click()
    await page.getByLabel('Setting 1 name for LA-2A').fill('Peak reduction')
    await page.getByLabel('Setting 1 value for LA-2A').fill('35')
    const outboardSaved = page.waitForResponse(
      (r) =>
        r.url().includes('/recall/outboard/') &&
        r.request().method() === 'PATCH'
    )
    await page.getByRole('button', { name: 'Save LA-2A' }).click()
    expect((await outboardSaved).status()).toBe(200)

    // Print / PDF.
    const pdf = await request.get(`/api/sessions/${sessionId}/recall/pdf`)
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()['content-type']).toBe('application/pdf')
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')

    // A second session copies it exactly.
    const otherId = await sessionWithInputs(request)
    const copy = await request.post(`/api/sessions/${otherId}/recall`, {
      data: { fromSessionId: sessionId }
    })
    expect(copy.status()).toBe(201)
    await page.goto(`/sessions/${otherId}/recall`)
    await page
      .getByRole('button', { name: 'List', exact: true })
      .click({ timeout: 30_000 })
    await expect(page.locator('details').first()).toContainText('Gain 32 dB')
    await expect(page.getByLabel('Outboard unit name for LA-2A')).toBeVisible()
    await expect(page.getByLabel('Setting 1 value for LA-2A')).toHaveValue('35')

    await request.delete(`/api/sessions/${otherId}`)
    await request.delete(`/api/sessions/${sessionId}`)
    await request.delete(`/api/consoles/${consoleId}`)
  })

  test('creates a console from the page and edits a template', async ({
    page,
    request
  }) => {
    const name = `Desk ${uniqueSuffix()}`
    await page.goto('/consoles')
    await page.getByRole('button', { name: 'Add console' }).first().click({
      timeout: 30_000
    })
    await page.getByLabel('Name', { exact: true }).fill(name)
    await page.getByRole('button', { name: 'Add console' }).last().click()
    await expect(page.getByText(name)).toBeVisible({ timeout: 30_000 })

    const list = await (await request.get('/api/consoles')).json()
    const created = list.consoles.find((c: { name: string }) => c.name === name)
    expect(created.templateName).toBe('Generic analogue desk')

    await page.goto(`/consoles/templates/${created.templateId}`)
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
      'Generic analogue desk',
      { timeout: 30_000 }
    )
    // The template is in use, so it cannot be deleted.
    const refused = await request.delete(
      `/api/console-templates/${created.templateId}`
    )
    expect(refused.status()).toBe(409)

    await request.delete(`/api/consoles/${created.id}`)
    await request.delete(`/api/console-templates/${created.templateId}`)
  })
})

test.describe('visual desk templates', () => {
  test.use({ storageState: OWNER_STATE })

  test('builds a desk, sets a home value by dragging and typing, and warns before dropping it', async ({
    page,
    request
  }) => {
    const name = `Visual desk ${uniqueSuffix()}`
    await page.goto('/consoles/templates/new')
    await page
      .getByLabel('Name', { exact: true })
      .fill(name, { timeout: 30_000 })

    // Click to add from the library; the inspector edits the new knob.
    await page.getByRole('button', { name: 'Add a knob' }).click()
    await page.getByLabel('Label', { exact: true }).fill('Drive')
    await page.getByLabel('Max', { exact: true }).fill('10')
    await page.getByRole('button', { name: 'Add a fader' }).click()
    await page.getByRole('button', { name: 'Create template' }).click()
    await page.waitForURL(/\/consoles\/templates\/(?!new)/, {
      timeout: 30_000
    })
    const templateId = page.url().split('/').pop() as string

    // A saved template with controls opens in values mode.
    const canvas = page.getByTestId('desk-canvas')
    await expect(canvas).toHaveAttribute('data-view', /,/, { timeout: 30_000 })
    const [scale, vx, vy] = (await canvas.getAttribute('data-view'))!
      .split(',')
      .map(Number)
    const box = (await canvas.boundingBox())!
    // The knob sits top left of the strip: its centre is (10, 8.5) mm, below
    // the 12 mm scribble strip.
    const x = box.x + vx + 10 * scale
    const y = box.y + vy + (12 + 8.5) * scale
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y - 50, { steps: 5 })
    await page.mouse.move(x, y - 100, { steps: 5 })
    await page.mouse.up()
    // 100 px up is half of the 0 to 10 range.
    const value = page.getByLabel('Value', { exact: true })
    await expect(value).toHaveValue('5')

    await value.fill('7')
    await value.press('Enter')
    const saved = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/console-templates/${templateId}`) &&
        r.request().method() === 'PATCH'
    )
    await page.getByRole('button', { name: 'Save template' }).click()
    expect((await saved).status()).toBe(200)
    let stored = await (
      await request.get(`/api/console-templates/${templateId}`)
    ).json()
    expect(stored.template.defaultValues.strip).toEqual({ drive: 7 })

    // Removing the knob in layout mode warns that its value goes.
    await page.getByRole('button', { name: 'Layout', exact: true }).click()
    await page.getByText('All components').click()
    await page.getByRole('button', { name: /^Drive/ }).click()
    await page.getByRole('button', { name: 'Remove' }).click()
    await page.getByRole('button', { name: 'Save template' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Drive (7)')
    await expect(dialog).toContainText('not affected')
    await dialog.getByRole('button', { name: 'Save anyway' }).click()
    await expect(dialog).toBeHidden()
    await expect
      .poll(async () => {
        stored = await (
          await request.get(`/api/console-templates/${templateId}`)
        ).json()
        return stored.template.defaultValues.strip
      })
      .toEqual({})

    await request.delete(`/api/console-templates/${templateId}`)
  })
})

test.describe('viewer', () => {
  test.use({ storageState: VIEWER_STATE })

  test('can read the consoles page but not change anything', async ({
    page,
    request
  }) => {
    await page.goto('/consoles')
    await expect(
      page.getByRole('heading', { name: 'Consoles & recall' })
    ).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Add console' })).toHaveCount(
      0
    )

    const write = await request.post('/api/consoles', {
      data: {
        name: 'Nope',
        channelCount: 8,
        builtinTemplateId: 'generic-analogue'
      }
    })
    expect(write.status()).toBe(403)
    const recall = await request.post(
      `/api/sessions/${SEEDED_SESSION}/recall`,
      { data: { consoleId: 'x' } }
    )
    expect(recall.status()).toBe(403)
  })
})
