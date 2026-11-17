import { test as base } from '@playwright/test'

export { expect } from '@playwright/test'
export type { APIRequestContext, Page } from '@playwright/test'

// Every page.goto waits for React to hydrate (see HydrationFlag). Without it a
// test can fill a field before hydration, which then resets the field and
// submits an empty form: a flake that only shows under load.
export const test = base.extend({
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page)
    page.goto = async (url, options) => {
      const response = await goto(url, options)
      await page
        .locator('html[data-hydrated="true"]')
        .waitFor({ state: 'attached', timeout: 30_000 })
        .then(() =>
          page.waitForFunction(
            () => !document.querySelector('[data-hydration-pending]'),
            undefined,
            { timeout: 30_000 }
          )
        )
        .catch(() => {
          // Pages that redirect away or download (no HTML) have nothing to wait for.
        })
      return response
    }
    await use(page)
  }
})
