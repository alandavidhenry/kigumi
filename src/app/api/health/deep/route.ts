import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { assertCronAuthorised } from '@/lib/cron'
import { checkDatabase, checkStorage } from '@/lib/health'

// Deep dependency check (DB + Blob Storage), used only by the CI/CD smoke test,
// not by Azure's continuous health monitor (see GET /api/health). It needs the
// same bearer secret as the cron routes: left open, anyone could keep Neon
// awake and read which dependency is down.
export async function GET(request: Request) {
  try {
    assertCronAuthorised(request)
  } catch (error) {
    return toErrorResponse(error)
  }

  const [db, storage] = await Promise.all([checkDatabase(), checkStorage()])

  const checks = {
    db: db ? 'ok' : 'error',
    storage: storage ? 'ok' : 'error'
  }
  const allOk = db && storage

  return NextResponse.json(
    { status: allOk ? 'ok' : 'degraded', checks },
    { status: allOk ? 200 : 503, headers: { 'cache-control': 'no-store' } }
  )
}
