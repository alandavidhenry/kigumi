import { scaleLinear } from 'd3-scale'
import { lineRadial } from 'd3-shape'

import { POLAR_FLOOR_DB } from '@/lib/charts/polar'
import type { PolarPoint } from '@/lib/charts/polar'
import { MIC_CURVE_METHOD_LABELS } from '@/lib/mics/types'
import type { MicCurveMethod } from '@/lib/mics/types'

export interface PolarSeries {
  key: string
  label: string
  points: readonly PolarPoint[]
  // Required: the plot always says whether it is measured or idealised.
  method: MicCurveMethod
}

const SIZE = 320
const CENTRE = SIZE / 2
const RADIUS = 128
const COLOURS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)'
]
const RINGS = [-30, -20, -10, 0]
const SPOKES = Array.from({ length: 12 }, (_, i) => i * 30)

const radians = (degrees: number) => (degrees * Math.PI) / 180

// Polar plot in dB relative to the on-axis response (ADR 0006). 0° points up.
// Idealised patterns are drawn dashed and carry an "Idealised — not measured"
// label that cannot be turned off.
export function PolarPlot({
  series,
  caption
}: {
  readonly series: readonly PolarSeries[]
  readonly caption?: string
}) {
  const radius = scaleLinear().domain([POLAR_FLOOR_DB, 0]).range([0, RADIUS])
  const path = lineRadial<PolarPoint>()
    .angle((d) => radians(d[0]))
    .radius((d) => radius(Math.max(POLAR_FLOOR_DB, Math.min(0, d[1]))))

  const idealised = series.some((s) => s.method === 'idealised')
  const description = series
    .map((s) => `${s.label} (${MIC_CURVE_METHOD_LABELS[s.method]})`)
    .join('; ')

  return (
    <figure className='space-y-2'>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role='img'
        aria-label={`Polar plot: ${description}`}
        className='mx-auto w-full max-w-xs'
      >
        <g transform={`translate(${CENTRE} ${CENTRE})`}>
          {RINGS.map((db) => (
            <g key={db}>
              <circle
                r={radius(db)}
                fill='none'
                stroke='var(--border-strong)'
                strokeDasharray={db === 0 ? undefined : '3 3'}
              />
              {db < 0 && (
                <text
                  y={-radius(db) - 2}
                  x={3}
                  fontSize={9}
                  fill='var(--muted-foreground)'
                >
                  {db} dB
                </text>
              )}
            </g>
          ))}
          {SPOKES.map((angle) => (
            <g key={angle}>
              <line
                x1={0}
                y1={0}
                x2={Math.sin(radians(angle)) * RADIUS}
                y2={-Math.cos(radians(angle)) * RADIUS}
                stroke='var(--border-strong)'
              />
              <text
                x={Math.sin(radians(angle)) * (RADIUS + 14)}
                y={-Math.cos(radians(angle)) * (RADIUS + 14) + 3}
                fontSize={10}
                textAnchor='middle'
                fill='var(--muted-foreground)'
              >
                {angle}°
              </text>
            </g>
          ))}
          {series.map((s, index) => (
            <path
              key={s.key}
              d={path([...s.points]) ?? undefined}
              fill='none'
              stroke={COLOURS[index % COLOURS.length]}
              strokeWidth={2}
              strokeDasharray={s.method === 'idealised' ? '6 4' : undefined}
              strokeLinejoin='round'
            />
          ))}
        </g>
      </svg>
      <figcaption className='space-y-0.5 text-center text-xs text-muted-foreground'>
        {series.map((s) => (
          <p
            key={s.key}
            className={
              s.method === 'idealised' ? 'font-medium text-warning' : undefined
            }
          >
            {s.label}: {MIC_CURVE_METHOD_LABELS[s.method]}
          </p>
        ))}
        {idealised && (
          <p>
            Drawn from the first-order formula r(θ) = A + (1 − A)·cos θ for the
            pattern type. Real microphones differ, especially at high
            frequencies.
          </p>
        )}
        {caption && <p>{caption}</p>}
      </figcaption>
    </figure>
  )
}
