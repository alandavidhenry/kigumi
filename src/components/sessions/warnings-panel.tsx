import { CheckCircle2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { SessionWarning } from '@/lib/sessions/warnings'

// Warnings about a session's input list. The words come from the rules and the
// catalogue, never from a model.
export function WarningsPanel({
  warnings
}: {
  readonly warnings: readonly Pick<SessionWarning, 'severity' | 'text'>[]
}) {
  if (warnings.length === 0) {
    return (
      <p className='flex items-center gap-2 text-sm text-muted-foreground'>
        <CheckCircle2 className='h-4 w-4 text-success' aria-hidden='true' />
        No problems found with this input list.
      </p>
    )
  }
  return (
    <ul className='space-y-1.5' aria-label='Warnings'>
      {warnings.map((warning, index) => (
        <li key={index} className='flex items-start gap-2 text-sm'>
          <Badge
            variant={
              warning.severity === 'blocking' ? 'destructive' : 'warning'
            }
            className='mt-0.5 shrink-0'
          >
            {warning.severity === 'blocking' ? 'Problem' : 'Check'}
          </Badge>
          <span>{warning.text}</span>
        </li>
      ))}
    </ul>
  )
}
