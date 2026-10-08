import { vi } from 'vitest'

// Silence console.error during tests. The source code uses console.error for
// expected error paths (e.g. Azure failures, missing users). Keeping stderr
// clean makes it easier to spot genuine test failures.
vi.spyOn(console, 'error').mockImplementation(() => {})
