// Seeded accounts used by the Playwright suite (see prisma/seed.ts). The
// password matches `npm run db:seed -- <password>`; both fall back to the seed
// script's development default.

export const OWNER_STATE = 'playwright/.auth/owner.json'
export const VIEWER_STATE = 'playwright/.auth/viewer.json'

const password = process.env.E2E_SEED_PASSWORD ?? 'kigumi-dev-password'

export const ownerCredentials = { email: 'owner@kigumi.test', password }
export const viewerCredentials = { email: 'viewer@kigumi.test', password }

export const SEEDED_ORGANISATION = 'Northern Lights Recording'
export const SEEDED_STUDIO_ID = 'seed-studio-main'
