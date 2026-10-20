'use client'

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'

import {
  FR_MAX_HZ,
  FR_MIN_HZ,
  FR_TICKS,
  formatHz,
  mergeCurves
} from '@/lib/charts/frequency'
import type { FrPoint } from '@/lib/charts/frequency'
import { MIC_CURVE_METHOD_LABELS } from '@/lib/mics/types'
import type { MicCurveMethod } from '@/lib/mics/types'

export interface FrequencyCurve {
  key: string
  label: string
  points: readonly FrPoint[]
  method: MicCurveMethod
}

const COLOURS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)'
]

// Log-frequency response, 20 Hz to 20 kHz (ADR 0006). One line per curve, so
// comparisons can overlay several mics. Every curve's provenance method is
// listed beneath the chart.
export function FrequencyResponseChart({
  curves,
  height = 280
}: {
  readonly curves: readonly FrequencyCurve[]
  readonly height?: number
}) {
  const data = mergeCurves(curves)
  return (
    <figure className='space-y-3'>
      <div
        role='img'
        aria-label={`Frequency response, ${curves.map((c) => c.label).join(', ')}`}
        style={{ height }}
      >
        <ResponsiveContainer width='100%' height='100%'>
          <LineChart
            data={data}
            margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
          >
            <CartesianGrid
              stroke='var(--border-strong)'
              strokeDasharray='3 3'
            />
            <XAxis
              dataKey='hz'
              type='number'
              scale='log'
              domain={[FR_MIN_HZ, FR_MAX_HZ]}
              ticks={FR_TICKS}
              tickFormatter={formatHz}
              allowDataOverflow
              stroke='var(--muted-foreground)'
              fontSize={12}
            />
            <YAxis
              stroke='var(--muted-foreground)'
              fontSize={12}
              width={48}
              unit=' dB'
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--popover)',
                border: '1px solid var(--border-strong)',
                borderRadius: 6,
                fontSize: 12
              }}
              labelFormatter={(hz) => `${formatHz(Number(hz))} Hz`}
              formatter={(value) => `${value} dB`}
            />
            {curves.length > 1 && <Legend />}
            {curves.map((curve, index) => (
              <Line
                key={curve.key}
                dataKey={curve.key}
                name={curve.label}
                type='monotone'
                stroke={COLOURS[index % COLOURS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className='space-y-0.5 text-xs text-muted-foreground'>
        {curves.map((curve) => (
          <p key={curve.key}>
            {curve.label}: {MIC_CURVE_METHOD_LABELS[curve.method]}. Normalised
            to 0 dB at 1 kHz.
          </p>
        ))}
      </figcaption>
    </figure>
  )
}
