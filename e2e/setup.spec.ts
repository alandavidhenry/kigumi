import { OWNER_STATE } from './credentials'
import { expect, test, type Page } from './fixtures'
import { uniqueSuffix } from './helpers'

test.use({ storageState: OWNER_STATE })

// A save ends with router.refresh(), which can land after the wizard has moved
// on and put the URL's step back. Wait for that traffic before navigating.
async function settled(page: Page) {
  await page.waitForLoadState('networkidle')
}

// The setup wizard re-runs safely on a seeded organisation: each step saves
// through the normal APIs and can be skipped. The test removes what it adds,
// because the wizard hides a room preset once a room of that name exists, so
// leftovers would break the next run.
test('the setup wizard adds a room, a mic and a desk, then reaches done', async ({
  page,
  request
}) => {
  const suffix = uniqueSuffix()
  const roomIds: string[] = []
  const unitIds: string[] = []
  const consoleIds: string[] = []

  page.on('response', async (response) => {
    const url = response.url()
    const method = response.request().method()
    if (method !== 'POST' || !response.ok()) return
    try {
      if (/\/api\/studios\/[^/]+\/rooms$/.test(url)) {
        roomIds.push((await response.json()).room.id)
      } else if (url.endsWith('/api/locker/bulk')) {
        unitIds.push(...(await response.json()).unitIds)
      } else if (url.endsWith('/api/consoles')) {
        consoleIds.push((await response.json()).console.id)
      }
    } catch {
      // Body already gone (navigation); the cleanup below just has less to do.
    }
  })

  try {
    await page.goto('/setup?step=rooms')
    await expect(
      page.getByRole('heading', { name: 'Set up your studio' })
    ).toBeVisible()

    await page.getByRole('button', { name: 'Vocal booth', exact: true }).click()
    await page.getByLabel('Room name').fill(`Vocal booth ${suffix}`)
    await page.getByLabel('Width').fill('2.5')
    await page.getByLabel('Length').fill('3')
    await page.getByRole('button', { name: 'Add room' }).click()
    await expect(page.getByText(`Vocal booth ${suffix}`)).toBeVisible()
    await settled(page)

    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page).toHaveURL(/step=mics/)
    await page.getByLabel('Search the catalogue').fill('SM57')
    await page.getByRole('button', { name: /Shure SM57/ }).click()
    const added = page.waitForResponse(
      (r) =>
        r.url().includes('/api/locker/bulk') && r.request().method() === 'POST'
    )
    await page.getByRole('button', { name: /Add 1 mic to locker/ }).click()
    expect((await added).ok()).toBe(true)
    await expect(
      page.getByRole('button', { name: /Add 0 mics to locker/ })
    ).toBeVisible()
    await settled(page)

    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page).toHaveURL(/step=desk/)
    await expect(page.getByLabel('Desk template')).toContainText(
      'Generic analogue desk'
    )
    await page.getByLabel('Console name').fill(`Desk ${suffix}`)
    await page.getByRole('button', { name: 'Add console' }).click()
    await expect(page.getByText(`Desk ${suffix}`)).toBeVisible()
    await settled(page)

    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page).toHaveURL(/step=done/)
    await expect(
      page.getByRole('button', { name: /Plan your first session/ })
    ).toBeVisible()
  } finally {
    for (const id of consoleIds) await request.delete(`/api/consoles/${id}`)
    for (const id of unitIds) await request.delete(`/api/locker/${id}`)
    for (const id of roomIds) await request.delete(`/api/rooms/${id}`)
  }
})
