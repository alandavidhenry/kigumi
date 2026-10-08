import { Check } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  FEATURE_LABELS,
  PLAN_INFO,
  PLAN_LIMITS,
  PLAN_ORDER,
  PlanTier,
  featuresIntroducedBy,
  formatLimit,
  formatPrice,
  formatStorage
} from '@/lib/plans'
import { cn } from '@/lib/utils'

// Everything in Free, listed once so the paid columns only show what they add.
const INCLUDED_EVERYWHERE = [
  'Equipment inventory & mic locker',
  'Mic catalogue & comparisons',
  'Layouts, sessions & input lists',
  'Recall sheets & safety warnings',
  'CSV import/export & QR labels',
  'Share links (Kigumi-branded)'
]

function limitRows(tier: PlanTier) {
  const limits = PLAN_LIMITS[tier]
  return [
    `${formatLimit(limits.studios)} ${limits.studios === 1 ? 'studio' : 'studios'}`,
    `${formatLimit(limits.rooms)} rooms`,
    `${formatLimit(limits.seats)} ${limits.seats === 1 ? 'seat' : 'seats'}`,
    `${formatLimit(limits.inventoryItems)} inventory items`,
    `${formatLimit(limits.aiRequestsPerMonth)} AI requests / month`,
    `${formatStorage(limits.storageMb)} file storage`
  ]
}

// Plan comparison driven entirely by src/lib/plans.ts, so pricing changes
// happen in one place.
export function PlanComparison({ current }: { readonly current: PlanTier }) {
  return (
    <div
      id='plans'
      className='grid scroll-mt-20 gap-4 sm:grid-cols-2 xl:grid-cols-4'
    >
      {PLAN_ORDER.map((tier, index) => {
        const info = PLAN_INFO[tier]
        const isCurrent = tier === current
        const previous = index > 0 ? PLAN_INFO[PLAN_ORDER[index - 1]] : null
        const features = featuresIntroducedBy(tier).map(
          (feature) => FEATURE_LABELS[feature]
        )

        return (
          <section
            key={tier}
            aria-label={`${info.label} plan`}
            className={cn(
              'flex flex-col gap-4 rounded-lg border bg-card p-4',
              isCurrent && 'border-brand'
            )}
          >
            <div className='space-y-1'>
              <div className='flex items-center justify-between gap-2'>
                <h3 className='font-semibold'>{info.label}</h3>
                {isCurrent && <Badge>Current plan</Badge>}
              </div>
              <p className='text-xs text-muted-foreground'>{info.audience}</p>
            </div>

            <div>
              <p className='text-2xl font-semibold'>
                {tier === PlanTier.FACILITY && 'From '}
                {formatPrice(info.monthlyPricePence)}
                {info.monthlyPricePence !== 0 && (
                  <span className='text-sm font-normal text-muted-foreground'>
                    {' '}
                    / month
                  </span>
                )}
              </p>
              <p className='text-xs text-muted-foreground'>
                {info.annualPricePence
                  ? `or ${formatPrice(info.annualPricePence)} a year`
                  : info.monthlyPricePence === 0
                    ? 'Free forever'
                    : 'Annual invoicing available'}
              </p>
            </div>

            <ul className='space-y-1.5 text-sm'>
              {limitRows(tier).map((row) => (
                <li key={row} className='text-muted-foreground'>
                  {row}
                </li>
              ))}
            </ul>

            <ul className='space-y-1.5 border-t pt-3 text-sm'>
              {previous && (
                <li className='text-xs text-muted-foreground'>
                  Everything in {previous.label}, plus:
                </li>
              )}
              {(previous ? features : INCLUDED_EVERYWHERE).map((label) => (
                <li key={label} className='flex gap-2'>
                  <Check className='mt-0.5 h-4 w-4 shrink-0 text-brand' />
                  {label}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
