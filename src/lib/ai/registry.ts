import Anthropic from '@anthropic-ai/sdk'

import { aiUnavailable } from '@/lib/errors'

import { AnthropicProvider } from './anthropic'
import { aiEnabled, localConfig, providerName } from './config'
import { LocalProvider } from './local'

import type { AiProvider } from './provider'

let override: AiProvider | null = null
let anthropic: AiProvider | null = null

function buildLocal(): AiProvider {
  // Local output is written to the cache shared by every organisation, so a
  // local model must never serve real users.
  if (process.env.NODE_ENV === 'production') {
    throw aiUnavailable(
      'The local AI provider is for development only and is disabled in production.'
    )
  }
  const { baseUrl, model } = localConfig()
  if (!model) {
    throw aiUnavailable(
      'AI_PROVIDER=local needs AI_LOCAL_MODEL set to a model installed on your local server (for example "qwen2.5:7b").'
    )
  }
  return new LocalProvider(baseUrl, model)
}

// The provider the app uses. Throws AI_UNAVAILABLE (503) when AI is switched
// off or not configured, so cached output still works without a key.
export function getAiProvider(): AiProvider {
  if (!aiEnabled()) {
    throw aiUnavailable('AI features are switched off on this server.')
  }
  if (override) return override
  if (providerName() === 'local') return buildLocal()

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw aiUnavailable('AI features are not configured on this server.')
  }
  anthropic ??= new AnthropicProvider(
    new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 })
  )
  return anthropic
}

// Tests and local fakes. Pass null to go back to the real provider.
export function setAiProvider(provider: AiProvider | null): void {
  override = provider
}
