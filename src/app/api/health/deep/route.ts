import { NextResponse } from 'next/server'

import { checkDatabase, checkStorage } from '@/lib/health'

// Deep dependency check (DB + Blob Storage) — used only by the CI/CD smoke
// test, not by Azure's continuous health monitor. See GET /api/health.
export async function GET() {
  const [db, storage] = await Promise.all([checkDatabase(), checkStorage()])

  const checks = {
    db: db ? 'ok' : 'error',
    storage: storage ? 'ok' : 'error'
  }
  const allOk = db && storage

  return NextResponse.json(
    { status: allOk ? 'ok' : 'degraded', checks },
    { status: allOk ? 200 : 503 }
  )
}
