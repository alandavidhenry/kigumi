import { describe, expect, it } from 'vitest'

import {
  EXCLUSION_LABELS,
  FEEDBACK_REASON_LABELS,
  KIND_OPTIONS,
  PRESETS,
  UNFILLABLE_LABELS,
  WARNING_VARIANTS,
  techniqueLabel
} from '@/lib/recommendations/labels'
import { runRules } from '@/lib/recommendations/rules'
import {
  FEEDBACK_REASONS,
  normaliseRequest,
  recommendationRequestSchema
} from '@/lib/recommendations/schemas'
import {
  EXCLUSION_REASONS,
  SOURCE_KINDS,
  TECHNIQUES,
  WARNING_CODES
} from '@/lib/recommendations/types'
import { snapshotOf } from '@/test/recommendations'

describe('recommendation labels', () => {
  it('says something plain for every exclusion, warning severity, unfillable reason and feedback reason', () => {
    for (const reason of EXCLUSION_REASONS) {
      expect(EXCLUSION_LABELS[reason], reason).toMatch(/\w/)
    }
    expect(Object.keys(UNFILLABLE_LABELS).sort()).toEqual([
      'all_in_use',
      'no_suitable_mic'
    ])
    expect(Object.keys(WARNING_VARIANTS).sort()).toEqual([
      'blocking',
      'info',
      'warning'
    ])
    for (const reason of FEEDBACK_REASONS) {
      expect(FEEDBACK_REASON_LABELS[reason], reason).toMatch(/\w/)
    }
    // Warning text itself comes from the rules; this guards the code list the
    // UI relies on staying in step.
    expect(WARNING_CODES.length).toBeGreaterThan(10)
  })

  it('lists every source kind once, labelled, and every technique', () => {
    expect(KIND_OPTIONS.map((o) => o.value).sort()).toEqual(
      [...SOURCE_KINDS].sort()
    )
    for (const option of KIND_OPTIONS) expect(option.label).toMatch(/\w/)
    for (const technique of TECHNIQUES) {
      expect(techniqueLabel(technique)).toMatch(/\w/)
    }
  })
})

describe('presets', () => {
  it('offers a few, each a valid request that the rules can run', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(3)
    for (const preset of PRESETS) {
      const parsed = recommendationRequestSchema.safeParse({
        sources: preset.sources.map((s) => ({
          label: s.label,
          kind: s.kind,
          technique: s.technique
        }))
      })
      expect(parsed.success, preset.name).toBe(true)
      if (!parsed.success) continue
      const request = normaliseRequest(parsed.data)
      expect(() => runRules(request, snapshotOf([], []))).not.toThrow()
    }
  })

  it('never exceeds what the model can rank in one go', () => {
    for (const preset of PRESETS) {
      expect(preset.sources.length, preset.name).toBeLessThanOrEqual(16)
    }
  })
})
