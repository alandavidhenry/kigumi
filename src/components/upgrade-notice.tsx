import { Sparkles } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// The one upgrade prompt, used wherever a plan limit or paid feature stops
// the user. Links to the plan comparison until self-serve billing exists.
export function UpgradeNotice({
  title,
  description,
  planLabel,
  compact = false,
  className
}: {
  readonly title: string
  readonly description?: string
  readonly planLabel?: string | null
  readonly compact?: boolean
  readonly className?: string
}) {
  return (
    <div
      role='status'
      className={cn(
        'flex gap-3 rounded-lg border border-brand-border bg-brand-tint/40',
        compact ? 'items-center px-3 py-2' : 'flex-col p-5 sm:flex-row',
        className
      )}
    >
      <Sparkles className='h-5 w-5 shrink-0 text-brand' />
      <div className='min-w-0 flex-1 space-y-1'>
        <p className='font-medium'>{title}</p>
        {description && !compact && (
          <p className='text-muted-foreground'>{description}</p>
        )}
      </div>
      {planLabel && (
        <Button asChild size='sm' className='shrink-0'>
          <Link href='/settings/organisation#plans'>See {planLabel} plan</Link>
        </Button>
      )}
    </div>
  )
}
