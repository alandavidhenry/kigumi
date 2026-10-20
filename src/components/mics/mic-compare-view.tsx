import Link from 'next/link'

import { FrequencyResponseChart } from '@/components/mics/frequency-response-chart'
import { MicComparisonAi } from '@/components/mics/mic-comparison-ai'
import { PolarSection } from '@/components/mics/polar-section'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MicComparisonResult } from '@/lib/mics/ai'
import type { MicDetail } from '@/lib/mics/catalogue'
import { overlayCurves } from '@/lib/mics/compare'
import { comparisonRows, phantomWarning } from '@/lib/mics/format'

const nameOf = (mic: MicDetail) => `${mic.manufacturer} ${mic.model}`

// Side-by-side comparison of 2 to 4 catalogue microphones: specs with the
// differences marked, overlaid frequency response, polar plots, and the AI
// "which to use when" summary. Server component; charts and the AI card are
// client islands.
export function MicCompareView({
  mics,
  comparison,
  canGenerate,
  allowance
}: {
  readonly mics: MicDetail[]
  readonly comparison: MicComparisonResult | null
  readonly canGenerate: boolean
  readonly allowance: { remaining: number; limit: number } | null
}) {
  const rows = comparisonRows(mics)
  const { curves, missing } = overlayCurves(mics)
  const warnings = mics.flatMap((mic) => {
    const text = phantomWarning(mic)
    return text ? [{ id: mic.id, name: nameOf(mic), text }] : []
  })

  return (
    <div className='space-y-6'>
      {warnings.length > 0 && (
        <div
          role='alert'
          className='space-y-1 rounded-lg border border-warning/30 bg-warning/15 p-3 text-sm'
        >
          {warnings.map((warning) => (
            <p key={warning.id}>
              <span className='font-medium'>{warning.name}:</span>{' '}
              {warning.text}
            </p>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Specifications</CardTitle>
          <div className='text-sm text-muted-foreground'>
            Rows marked <Badge variant='info'>Differs</Badge> are not the same
            on every microphone. Values are as the manufacturer states them;
            &ldquo;Not yet recorded&rdquo; means the catalogue has no value.
          </div>
        </CardHeader>
        <CardContent className='overflow-x-auto p-0'>
          <table className='w-full min-w-[32rem] text-sm'>
            <caption className='sr-only'>
              Specifications of the selected microphones, side by side
            </caption>
            <thead>
              <tr className='border-y bg-muted/50 text-left'>
                <th scope='col' className='w-40 px-4 py-2 font-medium'>
                  Specification
                </th>
                {mics.map((mic) => (
                  <th
                    key={mic.id}
                    scope='col'
                    className='px-4 py-2 align-top font-medium'
                  >
                    <Link
                      href={`/mics/${mic.slug}`}
                      className='hover:underline'
                    >
                      {nameOf(mic)}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className='divide-y'>
              {rows.map((row) => (
                <tr
                  key={row.field}
                  className={row.differs ? 'bg-brand-tint/40' : undefined}
                >
                  <th
                    scope='row'
                    className='px-4 py-2 text-left align-top font-normal text-muted-foreground'
                  >
                    {row.label}
                    {row.differs && (
                      <Badge variant='info' className='ml-2'>
                        Differs
                      </Badge>
                    )}
                  </th>
                  {row.cells.map((cell) => (
                    <td key={cell.micId} className='px-4 py-2 align-top'>
                      <span
                        className={
                          cell.recorded ? undefined : 'text-muted-foreground'
                        }
                      >
                        {cell.value}
                      </span>
                      {cell.conditions && (
                        <span className='text-muted-foreground'>
                          {' '}
                          ({cell.conditions})
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Frequency response</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          {curves.length > 0 ? (
            <FrequencyResponseChart curves={curves} />
          ) : (
            <p className='text-sm text-muted-foreground'>
              None of these microphones has frequency-response data yet. Kigumi
              only plots curves from measured or published manufacturer data,
              never estimates.
            </p>
          )}
          {curves.length > 0 && missing.length > 0 && (
            <p className='text-sm text-muted-foreground'>
              No frequency-response data yet for {missing.join(', ')}, so{' '}
              {missing.length === 1 ? 'it is' : 'they are'} not on the chart.
            </p>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby='polar-heading' className='space-y-3'>
        <h2 id='polar-heading' className='text-base font-semibold'>
          Polar patterns
        </h2>
        <div className='grid gap-6 md:grid-cols-2'>
          {mics.map((mic) => (
            <Card key={mic.id}>
              <CardHeader>
                <CardTitle className='text-base'>{nameOf(mic)}</CardTitle>
              </CardHeader>
              <CardContent>
                <PolarSection
                  patterns={mic.polarPatterns}
                  polarData={mic.polarData}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <MicComparisonAi
        mics={mics.map((mic) => ({ slug: mic.slug, name: nameOf(mic) }))}
        initial={comparison}
        canGenerate={canGenerate}
        allowance={allowance}
      />
    </div>
  )
}
