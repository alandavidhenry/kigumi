'use client'

import { useMemo, useState } from 'react'

import { PolarPlot } from '@/components/mics/polar-plot'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  idealisedPolar,
  mirrorHalfPlot,
  normalisePolarPoints
} from '@/lib/charts/polar'
import type { PolarDataView } from '@/lib/mics/catalogue'
import { MIC_PATTERN_LABELS } from '@/lib/mics/types'
import type { MicPolarPattern } from '@/lib/mics/types'

const IDEALISED = 'idealised'

const byFrequency = (a: PolarDataView, b: PolarDataView) =>
  a.frequencyHz - b.frequencyHz

// Pattern and frequency switcher for one mic. Measured or digitised data is
// shown when it exists for the chosen pattern and frequency; otherwise the
// idealised pattern is drawn and labelled as such.
export function PolarSection({
  patterns,
  polarData
}: {
  readonly patterns: MicPolarPattern[]
  readonly polarData: PolarDataView[]
}) {
  const [pattern, setPattern] = useState<MicPolarPattern>(patterns[0])
  const available = useMemo(
    () =>
      polarData.filter((curve) => curve.pattern === pattern).sort(byFrequency),
    [polarData, pattern]
  )
  const [choice, setChoice] = useState<string>(
    available[0] ? String(available[0].frequencyHz) : IDEALISED
  )

  const selected = available.find(
    (curve) => String(curve.frequencyHz) === choice
  )

  const series = selected
    ? {
        key: selected.id,
        label: `${MIC_PATTERN_LABELS[pattern]}, ${selected.frequencyHz} Hz`,
        method: selected.method,
        points: normalisePolarPoints(
          selected.mirrored ? mirrorHalfPlot(selected.points) : selected.points
        )
      }
    : {
        key: `ideal-${pattern}`,
        label: MIC_PATTERN_LABELS[pattern],
        method: 'idealised' as const,
        points: idealisedPolar(pattern)
      }

  const onPattern = (next: MicPolarPattern) => {
    setPattern(next)
    const first = polarData
      .filter((curve) => curve.pattern === next)
      .sort(byFrequency)[0]
    setChoice(first ? String(first.frequencyHz) : IDEALISED)
  }

  return (
    <div className='space-y-4'>
      <div className='grid gap-3 sm:grid-cols-2'>
        <div className='space-y-1'>
          <Label htmlFor='polar-pattern'>Pattern</Label>
          <NativeSelect
            id='polar-pattern'
            value={pattern}
            onChange={(event) =>
              onPattern(event.target.value as MicPolarPattern)
            }
          >
            {patterns.map((key) => (
              <option key={key} value={key}>
                {MIC_PATTERN_LABELS[key]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className='space-y-1'>
          <Label htmlFor='polar-frequency'>Frequency</Label>
          <NativeSelect
            id='polar-frequency'
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
          >
            <option value={IDEALISED}>Idealised pattern</option>
            {available.map((curve) => (
              <option key={curve.id} value={String(curve.frequencyHz)}>
                {curve.frequencyHz >= 1000
                  ? `${curve.frequencyHz / 1000} kHz`
                  : `${curve.frequencyHz} Hz`}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <PolarPlot series={[series]} />
    </div>
  )
}
