import { Download } from 'lucide-react'

import { PrintButton } from '@/app/(app)/inventory/valuation/print-button'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { UpgradeNotice } from '@/components/upgrade-notice'
import { getValuationReport } from '@/lib/equipment-io'
import { EQUIPMENT_CATEGORY_LABELS } from '@/lib/equipment-types'
import {
  Feature,
  FEATURE_LABELS,
  PLAN_LABELS,
  hasFeature,
  minimumTierFor
} from '@/lib/plans'
import { getTenantContext } from '@/lib/tenant-context'
import { formatMoney } from '@/lib/validation'

export const metadata = { title: 'Valuation report' }

export default async function ValuationPage() {
  const ctx = await getTenantContext()

  if (!hasFeature(ctx.planTier, Feature.VALUATION_REPORT)) {
    return (
      <div className='space-y-6'>
        <PageHeader
          title='Valuation report'
          backHref='/inventory'
          backLabel='Inventory'
        />
        <UpgradeNotice
          title={`${FEATURE_LABELS[Feature.VALUATION_REPORT]} is a paid feature.`}
          description='An insurance-ready list of your equipment with purchase prices and totals.'
          planLabel={PLAN_LABELS[minimumTierFor(Feature.VALUATION_REPORT)]}
        />
      </div>
    )
  }

  const report = await getValuationReport(ctx)

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Valuation report'
        description='Based on purchase prices. Retired items are excluded.'
        backHref='/inventory'
        backLabel='Inventory'
        actions={
          <div className='flex gap-2'>
            <Button asChild variant='surface'>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href='/api/equipment/valuation?format=csv'>
                <Download />
                CSV
              </a>
            </Button>
            <PrintButton />
          </div>
        }
      />

      <div className='print-area space-y-4'>
        <div>
          <h2 className='text-lg font-semibold'>{ctx.organisationName}</h2>
          <p className='text-sm text-muted-foreground'>
            Equipment valuation ·{' '}
            {new Date(report.generatedAt).toLocaleDateString('en-GB', {
              dateStyle: 'long'
            })}
          </p>
        </div>

        <Card className='overflow-x-auto p-0'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Serial</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className='text-right'>Qty</TableHead>
                <TableHead className='text-right'>Each</TableHead>
                <TableHead className='text-right'>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    {line.make} {line.model}
                    <span className='block text-xs text-muted-foreground'>
                      {EQUIPMENT_CATEGORY_LABELS[line.category]}
                    </span>
                  </TableCell>
                  <TableCell className='font-mono text-xs'>
                    {line.serial ?? '—'}
                  </TableCell>
                  <TableCell>{line.roomName ?? '—'}</TableCell>
                  <TableCell className='text-right'>{line.quantity}</TableCell>
                  <TableCell className='text-right'>
                    {formatMoney(line.unitPriceMinor)}
                  </TableCell>
                  <TableCell className='text-right'>
                    {formatMoney(line.totalMinor)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              {report.byCategory.map((entry) => (
                <TableRow key={entry.category}>
                  <TableCell colSpan={3}>
                    {EQUIPMENT_CATEGORY_LABELS[entry.category]}
                  </TableCell>
                  <TableCell className='text-right'>{entry.items}</TableCell>
                  <TableCell />
                  <TableCell className='text-right'>
                    {formatMoney(entry.totalMinor)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={5} className='font-semibold'>
                  Total
                </TableCell>
                <TableCell className='text-right font-semibold'>
                  {formatMoney(report.totalMinor)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </Card>

        {report.unpricedCount > 0 && (
          <p className='text-sm text-muted-foreground'>
            {report.unpricedCount}{' '}
            {report.unpricedCount === 1 ? 'item has' : 'items have'} no purchase
            price and {report.unpricedCount === 1 ? 'is' : 'are'} not included
            in the totals.
          </p>
        )}
      </div>
    </div>
  )
}
