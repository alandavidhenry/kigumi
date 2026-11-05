import { useAzureMonitor } from '@azure/monitor-opentelemetry'

// Azure Monitor (Application Insights) via OpenTelemetry. Loaded only by
// src/instrumentation.ts when APPLICATIONINSIGHTS_CONNECTION_STRING is set,
// which the distro reads itself.

export function telemetryOptions(
  env: Record<string, string | undefined> = process.env
) {
  const ratio = Number(env.OTEL_TRACES_SAMPLER_RATIO)
  return {
    // Fraction of requests traced in full; errors and metrics are unaffected.
    samplingRatio: ratio > 0 && ratio <= 1 ? ratio : 1,
    // Live Metrics in the portal: requests, failures and dependency calls as
    // they happen, useful during a deploy or an incident.
    enableLiveMetrics: true,
    instrumentationOptions: {
      http: { enabled: true },
      azureSdk: { enabled: true },
      postgreSql: { enabled: true }
    }
  }
}

let started = false

export function startTelemetry(): void {
  if (started) return
  started = true
  // Not a React hook, despite the name.
  useAzureMonitor(telemetryOptions())
}
