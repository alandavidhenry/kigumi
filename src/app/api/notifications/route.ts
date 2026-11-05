import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import {
  countUnreadNotifications,
  listNotifications
} from '@/lib/maintenance/notifications'
import { getTenantContext } from '@/lib/tenant-context'

export async function GET() {
  try {
    const ctx = await getTenantContext()
    const [notifications, unread] = await Promise.all([
      listNotifications(ctx),
      countUnreadNotifications(ctx)
    ])
    return NextResponse.json({ notifications, unread })
  } catch (error) {
    return toErrorResponse(error)
  }
}
