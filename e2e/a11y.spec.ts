import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import {
  OWNER_STATE,
  SEEDED_EQUIPMENT_ID,
  SEEDED_STUDIO_ID
} from './credentials'

import type { Page } from '@playwright/test'

// Automated accessibility checks (Phase 8, M8): axe-core against WCAG 2.1 A
// and AA on every main page, failing on serious and critical violations.
// Automated checks find roughly a third of real problems; keyboard and screen
// reader passes are still manual (see docs/testing.md).

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

// Production prefetches links continuously, so "network idle" may never come;
// wait for the page's own content instead.
async function pageReady(page: Page) {
  await page.waitForLoadState('load')
  await expect(page.locator('#main')).toBeVisible()
  await expect(page.locator('#main')).not.toBeEmpty()
}

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  const serious = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      rule: v.id,
      impact: v.impact,
      help: v.help,
      targets: v.nodes.slice(0, 5).map((n) => n.target.join(' '))
    }))
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
}

test.describe('signed-out pages', () => {
  for (const path of [
    '/',
    '/auth/sign-in',
    '/auth/sign-up',
    '/auth/forgot-password'
  ]) {
    test(`${path} has no serious violations`, async ({ page }) => {
      await page.goto(path)
      await pageReady(page)
      await expectNoSeriousViolations(page)
    })
  }
})

test.describe('signed-in pages', () => {
  test.use({ storageState: OWNER_STATE })

  const pages = [
    '/dashboard',
    `/studios`,
    `/studios/${SEEDED_STUDIO_ID}`,
    '/inventory',
    `/inventory/${SEEDED_EQUIPMENT_ID}`,
    '/inventory/valuation',
    '/mics',
    '/mics/shure-sm57',
    '/mics/compare?mics=shure-sm57,shure-sm58',
    '/locker',
    '/recommendations',
    '/recommendations/seed-rec-result',
    '/sessions',
    '/sessions/seed-session-tracking',
    '/sessions/seed-session-tracking/layout',
    '/sessions/seed-session-tracking/inputs',
    '/layouts/templates',
    '/consoles',
    '/consoles/templates/new',
    '/maintenance',
    '/maintenance/plans',
    '/maintenance/log',
    '/maintenance/pat',
    '/warranties',
    '/notifications',
    '/settings/members',
    '/settings/organisation',
    '/activity'
  ]

  for (const path of pages) {
    test(`${path} has no serious violations`, async ({ page }) => {
      await page.goto(path)
      await pageReady(page)
      await expectNoSeriousViolations(page)
    })
  }

  test('the skip link is the first stop and moves focus to the content', async ({
    page
  }) => {
    await page.goto('/dashboard')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await expect(skip).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.locator('#main')).toBeFocused()
  })
})
