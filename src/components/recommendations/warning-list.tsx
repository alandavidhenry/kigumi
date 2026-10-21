import { Badge } from '@/components/ui/badge'
import { WARNING_VARIANTS } from '@/lib/recommendations/labels'
import type { RuleWarning } from '@/lib/recommendations/types'

// Notes from the rules layer. They are the same words wherever they appear and
// are never written by the model.
export function WarningList({
  warnings
}: {
  readonly warnings: readonly RuleWarning[]
}) {
  if (warnings.length === 0) return null
  return (
    <ul className='space-y-1.5'>
      {warnings.map((warning) => (
        <li
          key={`${warning.code}:${warning.text}`}
          className='flex items-start gap-2 text-sm'
        >
          <Badge
            variant={WARNING_VARIANTS[warning.severity]}
            className='mt-0.5 shrink-0'
          >
            {warning.severity === 'blocking'
              ? 'Problem'
              : warning.severity === 'warning'
                ? 'Check'
                : 'Note'}
          </Badge>
          <span>{warning.text}</span>
        </li>
      ))}
    </ul>
  )
}
