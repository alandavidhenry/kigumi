// Runs the golden recommendation scenarios (eval/recommendations) and writes a
// report for the current prompt version. PLAN §4.4: "run in CI against the rules
// layer and manually against the LLM layer when prompts change".
//
//   npm run recs:eval -- --offline     rules, invariants and replays only: no model, no cost
//   npm run recs:eval                  also sends each scenario to the configured model
//   npm run recs:eval -- --scenario 003-drum-close-mics --no-report
//   npm run recs:eval -- --max-calls 10
//
// The model run uses ANTHROPIC_API_KEY (costs money) or AI_PROVIDER=local with
// AI_LOCAL_MODEL (free; judge plumbing, not quality). It is refused in
// production, and each scenario draws on the platform's daily request cap
// (ADR 0014), never an organisation's allowance. An offline run never replaces
// a report from a live run.
import fs from 'node:fs'
import path from 'node:path'

import { config } from 'dotenv'

import {
  EVAL_DIR,
  loadCatalogue,
  loadScenarios
} from '../eval/recommendations/load'
import { modelFor, providerName } from '../src/lib/ai/config'
import {
  RECOMMENDATION_PROMPT_VERSION,
  recommendationPrompt
} from '../src/lib/ai/prompts/mic-recommendation'
import {
  RECOMMENDATION_PROMPT_VERSION,
  recommendationPrompt
} from '../src/lib/ai/prompts/mic-recommendation'
import { modelFor, providerName } from '../src/lib/ai/config'
import {
  recordPlatformTokens,
  releasePlatformRequest,
  reservePlatformRequest
} from '../src/lib/ai/platform-cap'
import { getAiProvider } from '../src/lib/ai/registry'
import {
  buildScenario,
  checkInvariants,
  checkReplay,
  checkRulesExpectations,
  runScenarioRules
} from '../src/lib/recommendations/eval'
import { runModelScenario } from '../src/lib/recommendations/eval-model'
import type { ModelRun } from '../src/lib/recommendations/eval-model'
import { PROFILES_VERSION } from '../src/lib/recommendations/profiles'
import { RULES_VERSION } from '../src/lib/recommendations/rules'

config({ path: '.env.local', override: true })
config()

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(`--${name}`)
const option = (name: string) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}

const offline = flag('offline')
const only = option('scenario')
const maxCalls = Number(option('max-calls') ?? 40)
const writeReport = !flag('no-report') && !only

interface Row {
  id: string
  rules: string[]
  invariants: string[]
  replays: Array<{ name: string; failures: string[] }>
  model: ModelRun | null
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('recs:eval is not run in production.')
    process.exit(1)
  }

  const catalogue = loadCatalogue()
  let scenarios = loadScenarios()
  if (only) scenarios = scenarios.filter((s) => s.scenario.id === only)
  if (scenarios.length === 0) {
    console.error(only ? `No scenario "${only}".` : 'No scenarios found.')
    process.exit(1)
  }

  const provider = offline ? null : getAiProvider()
  const model = provider ? modelFor(recommendationPrompt.tier) : null
  let calls = 0

  const rows: Row[] = []
  for (const { scenario, replays } of scenarios) {
    const built = buildScenario(scenario, catalogue)
    const rules = runScenarioRules(built)
    const row: Row = {
      id: scenario.id,
      rules: checkRulesExpectations(scenario, built, rules),
      invariants: checkInvariants(built, rules),
      replays: replays.map(({ name, replay }) => ({
        name,
        failures: checkReplay(replay, built, rules)
      })),
      model: null
    }

    if (provider) {
      if (calls >= maxCalls) {
        console.warn(
          `Stopped before ${scenario.id}: --max-calls ${maxCalls} reached.`
        )
        rows.push(row)
        break
      }
      // One scenario is one paid request against the platform's daily cap.
      let day: string | null = null
      try {
        if (provider.costsMoney) day = await reservePlatformRequest()
        row.model = await runModelScenario(provider, scenario, built, rules)
      } finally {
        if (day) {
          if (!row.model || row.model.failedClosed)
            await releasePlatformRequest(day)
          if (row.model) {
            await recordPlatformTokens(day, {
              inputTokens: row.model.inputTokens,
              outputTokens: row.model.outputTokens
            })
          }
        }
      }
      if (row.model) calls++
    }
    rows.push(row)
  }

  // -------------------------------------------------------------------------
  const failed = (r: Row) =>
    r.rules.length > 0 ||
    r.invariants.length > 0 ||
    r.replays.some((x) => x.failures.length > 0)
  const modelRows = rows.filter((r) => r.model)
  const count = (n: number, of: number) => `${n}/${of}`

  const summary = [
    `Scenarios: ${rows.length}`,
    `Rules expectations: ${count(rows.filter((r) => r.rules.length === 0).length, rows.length)}`,
    `Invariants: ${count(rows.filter((r) => r.invariants.length === 0).length, rows.length)}`,
    `Replays: ${count(
      rows.flatMap((r) => r.replays).filter((x) => x.failures.length === 0)
        .length,
      rows.flatMap((r) => r.replays).length
    )}`
  ]
  if (provider) {
    const ok = modelRows.filter(
      (r) => !r.model!.failedClosed && r.model!.failures.length === 0
    )
    summary.push(
      `Model: judged expectations met ${count(ok.length, modelRows.length)}`,
      `Model: valid on first attempt ${count(modelRows.filter((r) => r.model!.firstAttemptValid).length, modelRows.length)}`,
      `Model: failed closed ${count(modelRows.filter((r) => r.model!.failedClosed).length, modelRows.length)}`,
      `Model: tokens in/out ${modelRows.reduce((s, r) => s + r.model!.inputTokens, 0)}/${modelRows.reduce((s, r) => s + r.model!.outputTokens, 0)}`
    )
  }

  const lines = [
    `# Recommendation evaluation: prompt v${RECOMMENDATION_PROMPT_VERSION}`,
    '',
    `Prompt version: ${RECOMMENDATION_PROMPT_VERSION}`,
    `Rules version: ${RULES_VERSION}`,
    `Profiles version: ${PROFILES_VERSION}`,
    `Date: ${new Date().toISOString().slice(0, 10)} (UTC)`,
    provider
      ? `Model run: ${providerName()} ${providerName() === 'local' ? (process.env.AI_LOCAL_MODEL ?? '') : model} (${modelRows.length} scenarios sent)`
      : 'Model run: not performed (offline: rules, invariants and replays only)',
    '',
    '## Summary',
    '',
    ...summary.map((s) => `- ${s}`),
    '',
    '## Scenarios',
    '',
    '| Scenario | Rules | Invariants | Replays | Model |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map((r) => {
      const m = r.model
      const modelCell = !m
        ? '—'
        : m.failedClosed
          ? 'failed closed'
          : m.failures.length > 0
            ? `unmet (${m.failures.length})`
            : `ok${m.firstAttemptValid ? '' : ' after retry'}`
      const replayPass = r.replays.filter((x) => x.failures.length === 0).length
      return `| ${r.id} | ${r.rules.length === 0 ? 'ok' : 'FAIL'} | ${r.invariants.length === 0 ? 'ok' : 'FAIL'} | ${r.replays.length === 0 ? '—' : `${replayPass}/${r.replays.length}`} | ${modelCell} |`
    }),
    ''
  ]

  const details = rows.filter(
    (r) =>
      failed(r) ||
      r.model?.failures.length ||
      r.model?.failedClosed ||
      r.model?.problems.length
  )
  if (details.length > 0) {
    lines.push('## Details', '')
    for (const r of details) {
      lines.push(`### ${r.id}`, '')
      for (const f of [...r.rules, ...r.invariants]) lines.push(`- ${f}`)
      for (const x of r.replays)
        for (const f of x.failures) lines.push(`- replay ${x.name}: ${f}`)
      for (const f of r.model?.failures ?? []) lines.push(`- model: ${f}`)
      for (const p of r.model?.problems ?? [])
        lines.push(`- model problem: ${p}`)
      lines.push('')
    }
  }

  const text = lines.join('\n')
  console.warn(text)

  if (writeReport) {
    const file = path.join(
      EVAL_DIR,
      'reports',
      `v${RECOMMENDATION_PROMPT_VERSION}.md`
    )
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
    const existingIsLive = /^Model run: (?!not performed)/m.test(existing)
    if (offline && existingIsLive) {
      console.warn(
        `\nKept ${file}: it holds a live model run and an offline run must not replace it.`
      )
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, text)
      console.warn(`\nWrote ${file}`)
    }
  }
  if (rows.some(failed)) process.exitCode = 1
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => process.exit())
