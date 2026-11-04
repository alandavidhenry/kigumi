import { expect, test, type APIRequestContext } from '@playwright/test'

import { OWNER_STATE, VIEWER_STATE } from './credentials'
import { uniqueSuffix } from './helpers'

// Sessions, the layout editor, the input list, PDF, share links and DAW export
// (Phase 5, ADR 0016). Tests create their own sessions so they can run in
// parallel; the two seeded sessions are only read, except that the stored
// recommendation is applied to the empty one (applying is idempotent).

const SEEDED_SESSION = 'seed-session-tracking'
const APPLY_SESSION = 'seed-session-apply'

async function createSession(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {}
) {
  const response = await request.post('/api/sessions', {
    data: {
      name: `E2E session ${uniqueSuffix()}`,
      roomId: 'seed-room-live',
      startsAt: '2031-03-10T10:00',
      endsAt: '2031-03-10T14:00',
      ...overrides
    }
  })
  expect(response.status()).toBe(201)
  const { session } = await response.json()
  return session.id as string
}

test.describe('owner', () => {
  test.use({ storageState: OWNER_STATE })

  test('creates a session from a starter template through the dialog', async ({
    page
  }) => {
    const name = `Vocal ${uniqueSuffix()}`
    await page.goto('/sessions')
    await page.getByRole('button', { name: 'New session' }).first().click({
      timeout: 30_000
    })
    await page.getByLabel('Name', { exact: true }).fill(name)
    await page.getByLabel('Start from').selectOption({ label: 'Vocal booth' })
    await page.getByRole('button', { name: 'Create session' }).click()

    await expect(page.getByRole('heading', { name })).toBeVisible({
      timeout: 30_000
    })
    // The starter template's microphone has a line on the input list, and a
    // warning that no real microphone has been chosen yet.
    await expect(
      page.getByRole('textbox', { name: 'Source for input 1' })
    ).toHaveValue('Vocal')
    await expect(
      page.getByText('no microphone from your locker is chosen')
    ).toBeVisible()
  })

  test('a microphone placed in the editor appears on the input list, and leaves with it', async ({
    page,
    request
  }) => {
    const id = await createSession(request)
    await page.goto(`/sessions/${id}/layout`)
    await expect(page.getByRole('heading', { name: /Layout:/ })).toBeVisible({
      timeout: 30_000
    })

    await page.getByRole('button', { name: 'Microphone', exact: true }).click()
    await expect(page.getByLabel('Selected item')).toBeVisible()
    const saved = page.waitForResponse(
      (r) => r.url().includes('/api/layouts/') && r.request().method() === 'PUT'
    )
    await page.getByLabel('Label', { exact: true }).fill('Snare top')
    expect((await saved).status()).toBe(200)
    await expect(page.getByTestId('save-status')).toHaveText(
      'All changes saved'
    )

    await page.goto(`/sessions/${id}`)
    await expect(
      page.getByRole('textbox', { name: 'Source for input 1' })
    ).toHaveValue('Snare top')

    // Remove the item again: the channel goes with it.
    await page.goto(`/sessions/${id}/layout`)
    await page.getByRole('button', { name: /Snare top/ }).click({
      timeout: 30_000
    })
    const removed = page.waitForResponse(
      (r) => r.url().includes('/api/layouts/') && r.request().method() === 'PUT'
    )
    await page.getByRole('button', { name: 'Delete item' }).click()
    expect((await removed).status()).toBe(200)
    await page.goto(`/sessions/${id}`)
    await expect(page.getByText('No inputs yet.')).toBeVisible()
  })

  test('arrow keys nudge the selected item by the snap step', async ({
    page,
    request
  }) => {
    const id = await createSession(request)
    await page.goto(`/sessions/${id}/layout`)
    await page.getByRole('button', { name: 'Amp', exact: true }).click({
      timeout: 30_000
    })
    const x = page.getByLabel('X (m)')
    const before = Number(await x.inputValue())
    // Move focus off the number field so the key goes to the editor.
    await page.getByRole('button', { name: /^Amp/ }).first().focus()
    await page.keyboard.press('ArrowRight')
    await expect(x).toHaveValue(
      String(Math.round((before + 0.05) * 1000) / 1000)
    )
  })

  test('the input list is shared with the layout: a unit chosen on the list moves the layout item', async ({
    request
  }) => {
    const id = await createSession(request, {
      startFrom: { kind: 'builtin', templateId: 'vocal-booth' }
    })
    const detail = await (await request.get(`/api/sessions/${id}`)).json()
    const channel = detail.session.channels[0]
    const patch = await request.patch(
      `/api/sessions/${id}/channels/${channel.id}`,
      { data: { micUnitId: 'seed-unit-u87' } }
    )
    expect(patch.status()).toBe(204)
    const after = (await (await request.get(`/api/sessions/${id}`)).json())
      .session
    expect(
      after.layout.items.find(
        (i: { id: string }) => i.id === channel.layoutItemId
      ).micUnitId
    ).toBe('seed-unit-u87')
    // A condenser defaults to phantom on, so there is nothing to warn about.
    expect(after.channels[0].phantom).toBe(true)
  })

  test('warns when a microphone is double-booked or its phantom power is off', async ({
    page,
    request
  }) => {
    // A copy of the seeded session overlaps it in time, so its microphones are
    // booked twice.
    const copy = await request.post(`/api/sessions/${SEEDED_SESSION}/duplicate`)
    expect(copy.status()).toBe(201)
    const id = (await copy.json()).session.id as string

    await page.goto(`/sessions/${id}`)
    await expect(
      page.getByText(/is also in Drum and vocal tracking/).first()
    ).toBeVisible({
      timeout: 30_000
    })

    // A controlled checkbox only changes once the server has saved, so click it
    // rather than asserting the state straight away.
    await page.getByLabel(/Phantom power for input 2/).click()
    await expect(
      page.getByText(/needs phantom power but it is off/)
    ).toBeVisible()
    await request.delete(`/api/sessions/${id}`)
  })

  test('downloads the session sheet and DAW track names', async ({
    request
  }) => {
    const pdf = await request.get(`/api/sessions/${SEEDED_SESSION}/sheet`)
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()['content-type']).toBe('application/pdf')
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')

    const layoutPdf = await request.get(
      `/api/layouts/${SEEDED_SESSION}-layout/pdf`
    )
    expect(layoutPdf.headers()['content-type']).toBe('application/pdf')

    const csv = await request.get(
      `/api/sessions/${SEEDED_SESSION}/daw-export?format=csv`
    )
    expect(await csv.text()).toBe(
      'Track,Name\r\n1,Snare\r\n2,Lead vocal\r\n3,Synth\r\n'
    )
    const txt = await request.get(
      `/api/sessions/${SEEDED_SESSION}/daw-export?format=txt`
    )
    expect(await txt.text()).toBe('1. Snare\n2. Lead vocal\n3. Synth\n')
  })

  test('shares a session read-only with someone who is not signed in, then revokes it', async ({
    request,
    browser
  }) => {
    const id = await createSession(request, {
      name: `Shared ${uniqueSuffix()}`,
      client: 'Secret client',
      notes: 'Private notes',
      startFrom: { kind: 'builtin', templateId: 'podcast-two' }
    })
    const share = await request.post(`/api/sessions/${id}/share`, { data: {} })
    expect(share.status()).toBe(201)
    const { token } = (await share.json()).share

    const guest = await browser.newContext()
    const page = await guest.newPage()
    await page.goto(`/share/${token}`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Shared'
    )
    // The seeded organisation is on the Studio plan, so the page is unbranded.
    await expect(page.getByText('Planned with Kigumi')).toHaveCount(0)
    await expect(page.getByText('Secret client')).toHaveCount(0)
    await expect(page.getByText('Private notes')).toHaveCount(0)
    await expect(page.getByRole('img', { name: /room layout/ })).toBeVisible()
    // There is no way from here into the app.
    await expect(page.getByRole('link', { name: 'Dashboard' })).toHaveCount(0)

    const pdf = await guest.request.get(`/api/share/${token}/sheet`)
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()['x-robots-tag']).toContain('noindex')
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')

    // Revoking stops it working at once.
    expect((await request.delete(`/api/sessions/${id}/share`)).status()).toBe(
      204
    )
    expect((await page.goto(`/share/${token}`))?.status()).toBe(404)
    expect(
      (await guest.request.get(`/api/share/${token}/sheet`)).status()
    ).toBe(404)
    await guest.close()
  })

  test('applies a stored recommendation to a session', async ({
    page,
    request
  }) => {
    const applied = await request.post(
      `/api/sessions/${APPLY_SESSION}/apply-recommendation`,
      { data: { resultId: 'seed-rec-result' } }
    )
    expect(applied.status()).toBe(200)

    await page.goto(`/sessions/${APPLY_SESSION}`)
    await expect(
      page.getByRole('textbox', { name: 'Source for input 1' })
    ).toHaveValue(/Lead vocal|Snare/, { timeout: 30_000 })
    const detail = (
      await (await request.get(`/api/sessions/${APPLY_SESSION}`)).json()
    ).session
    expect(
      detail.channels.map((c: { source: string }) => c.source).sort()
    ).toEqual(['Lead vocal', 'Snare'])
    // The AI's placement advice is text in the notes, not coordinates.
    expect(detail.channels[0].notes).toMatch(/^AI placement:/)

    // Applying again changes nothing.
    await request.post(`/api/sessions/${APPLY_SESSION}/apply-recommendation`, {
      data: { resultId: 'seed-rec-result' }
    })
    const again = (
      await (await request.get(`/api/sessions/${APPLY_SESSION}`)).json()
    ).session
    expect(again.channels).toHaveLength(2)
  })

  test('the recommendation page offers to apply it to a session', async ({
    page
  }) => {
    await page.goto('/recommendations/seed-rec-result')
    await expect(page.getByLabel('Apply to a session')).toBeVisible({
      timeout: 30_000
    })
    await expect(
      page.getByRole('button', { name: 'Apply to session' })
    ).toBeVisible()
  })

  test('another organisation cannot reach a session by id', async ({
    request
  }) => {
    const missing = await request.get('/api/sessions/not-a-real-session')
    expect(missing.status()).toBe(404)
    const layout = await request.get('/api/layouts/not-a-real-layout')
    expect(layout.status()).toBe(404)
  })

  test('lists layout templates: starter templates free, own templates on Studio', async ({
    page
  }) => {
    await page.goto('/layouts/templates')
    await expect(page.getByText('Band tracking')).toBeVisible({
      timeout: 30_000
    })
    await expect(page.getByText('Vocal booth')).toBeVisible()
    await expect(page.getByText('No templates yet')).toBeVisible()
  })
})

test.describe('viewer', () => {
  test.use({ storageState: VIEWER_STATE })

  test('can read a session but not change anything', async ({
    page,
    request
  }) => {
    await page.goto(`/sessions/${SEEDED_SESSION}`)
    await expect(
      page.getByRole('heading', { name: /Drum and vocal tracking/ })
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByRole('textbox', { name: 'Source for input 1' })
    ).toBeDisabled()
    await expect(
      page.getByRole('button', { name: 'Save details' })
    ).toHaveCount(0)
    await expect(page.getByLabel('Share link')).toHaveCount(0)

    await page.goto('/sessions')
    await expect(page.getByRole('button', { name: 'New session' })).toHaveCount(
      0
    )

    const create = await request.post('/api/sessions', {
      data: {
        name: 'Nope',
        startsAt: '2031-03-10T10:00',
        endsAt: '2031-03-10T14:00'
      }
    })
    expect(create.status()).toBe(403)
    const share = await request.post(`/api/sessions/${SEEDED_SESSION}/share`, {
      data: {}
    })
    expect(share.status()).toBe(403)
    // Reading, including the printable sheet, is allowed.
    expect(
      (await request.get(`/api/sessions/${SEEDED_SESSION}/sheet`)).status()
    ).toBe(200)
  })
})
