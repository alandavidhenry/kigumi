import { Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { UpgradeNotice } from '@/components/upgrade-notice'
import { ApiError } from '@/lib/client-api'

// Every piece of AI output carries this label (PLAN §4.3): it is generated
// text, not catalogue data.
export function AiGeneratedBadge() {
  return (
    <Badge variant='info' className='gap-1'>
      <Sparkles className='h-3 w-3' aria-hidden='true' />
      AI-generated
    </Badge>
  )
}

const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' })

export function AiProvenance({
  model,
  createdAt
}: {
  readonly model: string
  readonly createdAt: string
}) {
  return (
    <p className='text-xs text-muted-foreground'>
      Written by {model} on {date.format(new Date(createdAt))} from the
      specifications recorded in this catalogue. Any figures come from those
      records, but AI can still misjudge. Check the sources and the
      manufacturer&rsquo;s spec sheet before relying on it.
    </p>
  )
}

// Shown when generating failed. Running out of allowance becomes an upgrade
// prompt; everything else is a plain message.
export function AiRequestError({ error }: { readonly error: unknown }) {
  if (error instanceof ApiError && error.code === 'PLAN_LIMIT') {
    return (
      <UpgradeNotice
        title='You have used this month’s AI requests'
        description='Your allowance resets at the start of next month. A higher plan includes more AI requests.'
        planLabel='higher'
      />
    )
  }
  const message =
    error instanceof Error ? error.message : 'Something went wrong'
  return (
    <p role='alert' className='text-sm text-destructive'>
      {message}
    </p>
  )
}

export function allowanceText(allowance: {
  remaining: number
  limit: number
}): string {
  const limit = Number.isFinite(allowance.limit)
    ? String(allowance.limit)
    : 'unlimited'
  return Number.isFinite(allowance.limit)
    ? `Generating uses 1 of your ${limit} AI requests this month (${allowance.remaining} left).`
    : 'Generating uses 1 AI request.'
}
