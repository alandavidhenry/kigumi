'use client'

import { Bell, CheckCheck } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/client-api'
import type { NotificationRow } from '@/lib/maintenance/notifications'
import { cn } from '@/lib/utils'

const when = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short'
})

export function NotificationsList({
  notifications
}: {
  readonly notifications: NotificationRow[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const unread = notifications.filter((n) => !n.read)

  const markRead = async (body: { all: true } | { ids: string[] }) => {
    setBusy(true)
    try {
      await apiFetch('/api/notifications/read', { method: 'POST', body })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={Bell}
        title='No reminders'
        description='Due and overdue maintenance, PAT tests and expiring warranties show up here.'
      />
    )
  }

  return (
    <div className='space-y-3'>
      {unread.length > 0 && (
        <Button
          variant='surface'
          size='sm'
          disabled={busy}
          onClick={() => void markRead({ all: true })}
        >
          <CheckCheck />
          Mark all as read
        </Button>
      )}
      <ul className='divide-y rounded-lg border'>
        {notifications.map((notification) => (
          <li
            key={notification.id}
            className={cn(
              'flex flex-wrap items-start justify-between gap-2 p-3',
              !notification.read && 'bg-brand-tint/30'
            )}
          >
            <div className='min-w-0 space-y-0.5'>
              <p className='text-sm font-medium'>
                {!notification.read && (
                  <span className='sr-only'>Unread: </span>
                )}
                {notification.link ? (
                  <Link
                    href={notification.link}
                    className='hover:underline'
                    onClick={() => {
                      if (!notification.read) {
                        void markRead({ ids: [notification.id] })
                      }
                    }}
                  >
                    {notification.title}
                  </Link>
                ) : (
                  notification.title
                )}
              </p>
              {notification.body && (
                <p className='text-sm text-muted-foreground'>
                  {notification.body}
                </p>
              )}
              <p className='text-xs text-muted-foreground'>
                {when.format(new Date(notification.createdAt))}
              </p>
            </div>
            {!notification.read && (
              <Button
                variant='ghost'
                size='sm'
                disabled={busy}
                onClick={() => void markRead({ ids: [notification.id] })}
              >
                Mark read
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
