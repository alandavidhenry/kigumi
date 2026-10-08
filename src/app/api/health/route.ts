import { NextResponse } from 'next/server'

// Liveness check only — no DB/storage calls. Azure App Service's health
// monitor pings this continuously, so a DB query here would keep Neon awake
// around the clock. Dependency checks live at GET /api/health/deep, used only
// by the CI/CD smoke test.
export async function GET() {
  return NextResponse.json({ status: 'ok' })
}
