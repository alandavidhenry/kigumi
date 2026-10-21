import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { RECOMMENDATION_PROMPT_VERSION } from '@/lib/ai/prompts/mic-recommendation'
import {
  buildScenario,
  checkInvariants,
  checkReplay,
  checkRulesExpectations,
  runScenarioRules
} from '@/lib/recommendations/eval'
import { PROFILES_VERSION } from '@/lib/recommendations/profiles'
import { RULES_VERSION } from '@/lib/recommendations/rules'

import {
  EVAL_DIR,
  loadCatalogue,
  loadScenarios
} from '../../../eval/recommendations/load'

// The golden evaluation set (PLAN §4.4). Everything here runs in CI with no
// network: the rules layer against every scenario, and recorded or hand-written
// model replies through validation and finalise. Judging a live model against
// the `ai` expectations is the manual `npm run recs:eval`.

const catalogue = loadCatalogue()
const loaded = loadScenarios()

describe('the evaluation set', () => {
  it('is large enough to mean something and has unique, well-named scenarios', () => {
    expect(loaded.length).toBeGreaterThanOrEqual(25)
    const ids = loaded.map((l) => l.scenario.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const { file, scenario } of loaded) {
      expect(file, scenario.id).toBe(`${scenario.id}.json`)
      expect(
        Object.keys(scenario.expect.rules).length,
        `${scenario.id} expects nothing`
      ).toBeGreaterThan(0)
    }
  })

  it('covers the failure classes the pipeline exists to prevent', () => {
    const tags = new Set(loaded.flatMap((l) => l.scenario.tags))
    for (const tag of [
      'availability',
      'channels',
      'decca',
      'di',
      'injection',
      'ms',
      'pairs',
      'phantom',
      'question',
      'ribbon',
      'shortage',
      'spl',
      'stereo'
    ]) {
      expect(tags.has(tag), `no scenario tagged "${tag}"`).toBe(true)
    }
  })

  it('has no replay directory without a scenario', () => {
    const ids = new Set(loaded.map((l) => l.scenario.id))
    const dirs = fs.readdirSync(path.join(EVAL_DIR, 'replays'))
    for (const dir of dirs) expect(ids.has(dir), dir).toBe(true)
  })

  it('has replays for the replies that matter: valid, not owned, invented, phantom, allocation', () => {
    const names = new Set(loaded.flatMap((l) => l.replays.map((r) => r.name)))
    for (const name of [
      'valid',
      'names-a-mic-not-owned',
      'invented-number',
      'phantom-on',
      'double-allocation',
      'option-from-another-source',
      'placement-out-of-range',
      'injection-followed'
    ]) {
      expect(names.has(name), `no replay named "${name}"`).toBe(true)
    }
  })

  it('only attaches fictional specs to fixture microphones', () => {
    for (const [key, mic] of catalogue) {
      if (!key.startsWith('fixture:')) continue
      expect(mic.manufacturer, key).toBe('Fixture')
    }
  })
})

describe.each(loaded.map((l) => [l.scenario.id, l] as const))(
  '%s',
  (_id, { scenario, replays }) => {
    const built = buildScenario(scenario, catalogue)
    const out = runScenarioRules(built)

    it('meets its rules expectations', () => {
      expect(checkRulesExpectations(scenario, built, out)).toEqual([])
    })

    it('keeps the invariants: no unit twice, plan inside candidates, nothing unavailable', () => {
      expect(checkInvariants(built, out)).toEqual([])
    })

    it('does not depend on the order the locker arrives in', () => {
      const reversed = {
        ...built,
        snapshot: {
          ...built.snapshot,
          units: [...built.snapshot.units].reverse()
        }
      }
      expect(runScenarioRules(reversed)).toEqual(out)
    })

    it.each(replays.map((r) => [r.name, r.replay] as const))(
      'replay: %s',
      (_name, replay) => {
        expect(checkReplay(replay, built, out)).toEqual([])
      }
    )
  }
)

describe('the evaluation report', () => {
  it('exists for the current prompt, rules and profile versions', () => {
    const file = path.join(
      EVAL_DIR,
      'reports',
      `v${RECOMMENDATION_PROMPT_VERSION}.md`
    )
    expect(
      fs.existsSync(file),
      `Run "npm run recs:eval" and commit eval/recommendations/reports/v${RECOMMENDATION_PROMPT_VERSION}.md after changing the prompt`
    ).toBe(true)
    const report = fs.readFileSync(file, 'utf8')
    expect(report).toContain(`Prompt version: ${RECOMMENDATION_PROMPT_VERSION}`)
    expect(report).toContain(`Rules version: ${RULES_VERSION}`)
    expect(report).toContain(`Profiles version: ${PROFILES_VERSION}`)
    expect(report).toMatch(/^Model run: /m)
  })
})
