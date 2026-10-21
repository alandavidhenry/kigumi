import { recommendationPrompt } from '@/lib/ai/prompts/mic-recommendation'
import type { AiProvider } from '@/lib/ai/provider'
import { callWithValidation } from '@/lib/ai/service'

import { buildScenarioInput, checkAiExpectations } from './eval'
import { finalise } from './finalise'

import type { BuiltScenario, Scenario } from './eval'
import type { RulesOutput } from './types'

// The live-model half of the evaluation (npm run recs:eval). Kept out of
// eval.ts so CI's golden test, which needs no database or network, never
// imports the AI service.

export interface ModelRun {
  attempts: number
  firstAttemptValid: boolean
  failedClosed: boolean
  // Everything validation rejected, across attempts, or the error that closed it.
  problems: string[]
  // Unmet `expect.ai` expectations. Empty when the run was acceptable.
  failures: string[]
  adjustments: number
  inputTokens: number
  outputTokens: number
}

// Sends one scenario through the real prompt and validation exactly as the app
// does. Returns null when the rules left nothing to rank, so no model is
// called. Never throws for a model failure: that is the result.
export async function runModelScenario(
  provider: AiProvider,
  scenario: Scenario,
  built: BuiltScenario,
  rules: RulesOutput
): Promise<ModelRun | null> {
  const { input, aliases } = buildScenarioInput(built, rules)
  if (input.data.sources.length === 0) return null

  const run: ModelRun = {
    attempts: 0,
    firstAttemptValid: false,
    failedClosed: false,
    problems: [],
    failures: [],
    adjustments: 0,
    inputTokens: 0,
    outputTokens: 0
  }
  const tokens = { inputTokens: 0, outputTokens: 0 }
  try {
    const { content } = await callWithValidation(
      provider,
      recommendationPrompt,
      input,
      tokens,
      (attempt, problems) => {
        run.attempts = attempt
        if (attempt === 1) run.firstAttemptValid = problems.length === 0
        run.problems.push(...problems)
      }
    )
    const { view, adjustments } = finalise({
      request: built.request,
      rules,
      snapshot: built.snapshot,
      aliases,
      content
    })
    run.adjustments = adjustments.length
    run.failures = checkAiExpectations(scenario, view, adjustments)
  } catch (error) {
    run.failedClosed = true
    run.problems.push(error instanceof Error ? error.message : String(error))
  }
  run.inputTokens = tokens.inputTokens
  run.outputTokens = tokens.outputTokens
  return run
}
