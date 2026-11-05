import { vi } from 'vitest'

import { TEST_DATABASE_URL, assertTestDatabase } from './config'

// Runs before each database test file's imports, so src/lib/prisma.ts connects
// to the test database.
assertTestDatabase(TEST_DATABASE_URL)
process.env.DATABASE_URL = TEST_DATABASE_URL
process.env.BETTER_AUTH_SECRET ??= 'test-only-better-auth-secret-not-real'

vi.spyOn(console, 'error').mockImplementation(() => {})
