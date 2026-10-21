import fs from 'node:fs'
import path from 'node:path'

import {
  buildCatalogue,
  replaySchema,
  scenarioSchema
} from '../../src/lib/recommendations/eval'

import type {
  EvalCatalogue,
  Replay,
  Scenario
} from '../../src/lib/recommendations/eval'

// Reads the golden evaluation set from disk. Shared by the CI test and the
// manual run (npm run recs:eval).

export const EVAL_DIR = path.resolve('eval/recommendations')
const SEED_DIR = path.resolve('data/mics')

const readJson = (file: string): unknown =>
  JSON.parse(fs.readFileSync(file, 'utf8'))

export function loadCatalogue(): EvalCatalogue {
  const seed = fs
    .readdirSync(SEED_DIR)
    .filter((name) => name.endsWith('.json') && name !== 'makers.json')
    .sort()
    .flatMap(
      (name) =>
        (readJson(path.join(SEED_DIR, name)) as { entries: unknown[] }).entries
    )
  const fixtures = (
    readJson(path.join(EVAL_DIR, 'fixtures', 'mics.json')) as {
      mics: unknown[]
    }
  ).mics
  return buildCatalogue(seed, fixtures)
}

export interface LoadedScenario {
  file: string
  scenario: Scenario
  replays: Array<{ name: string; replay: Replay }>
}

export function loadScenarios(): LoadedScenario[] {
  const dir = path.join(EVAL_DIR, 'scenarios')
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((file) => {
      const scenario = scenarioSchema.parse(readJson(path.join(dir, file)))
      const replayDir = path.join(EVAL_DIR, 'replays', scenario.id)
      const replays = fs.existsSync(replayDir)
        ? fs
            .readdirSync(replayDir)
            .filter((name) => name.endsWith('.json'))
            .sort()
            .map((name) => ({
              name: name.replace(/\.json$/, ''),
              replay: replaySchema.parse(readJson(path.join(replayDir, name)))
            }))
        : []
      return { file, scenario, replays }
    })
}
