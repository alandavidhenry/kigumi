# 0006 — Charts: Recharts + custom SVG polar plots

**Status:** Accepted (2026-10-08)

## Context

Mic pages need (a) frequency response on a logarithmic 20 Hz–20 kHz axis, with several overlaid curves for comparisons, and (b) polar plots in dB per frequency and per pattern, including idealised first-order patterns. Minato already uses Recharts for dashboards.

## Decision

- **Frequency response:** Recharts `LineChart` with `XAxis scale="log" domain={[20, 20000]}`, custom ticks (20, 50, 100, 200, 500, 1k, 2k, 5k, 10k, 20k) and a dB `YAxis`. One `Line` per mic in comparisons.
- **Polar plots:** a small custom SVG component using `d3-scale` (radial dB scale, e.g. −30 to 0 dB) and `d3-shape` (`lineRadial`). Recharts' `RadarChart` uses categorical axes and can't plot continuous angle/dB data properly. The component also renders idealised patterns from `r(θ) = A + (1 − A)·cos θ`.
- Both read colours from the Tailwind semantic tokens so light and dark themes work.

## Consequences

- One charting dependency shared with Minato, plus two small d3 modules (not the whole of D3).
- Pattern maths and dB conversion live in `src/lib/charts/` for unit testing.
- Polar plots must show a "Measured" or "Idealised — not measured" label, enforced through the component's props.
