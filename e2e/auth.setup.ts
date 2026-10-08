import { test as setup } from '@playwright/test'

import {
  OWNER_STATE,
  VIEWER_STATE,
  ownerCredentials,
  viewerCredentials
} from './credentials'
import { expectOnDashboard, signIn } from './helpers'

setup('authenticate as owner', async ({ page }) => {
  await signIn(page, ownerCredentials.email, ownerCredentials.password)
  await expectOnDashboard(page)
  await page.context().storageState({ path: OWNER_STATE })
})

setup('authenticate as viewer', async ({ page }) => {
  await signIn(page, viewerCredentials.email, viewerCredentials.password)
  await expectOnDashboard(page)
  await page.context().storageState({ path: VIEWER_STATE })
})
