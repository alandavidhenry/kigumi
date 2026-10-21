// Guard against invented numbers (PLAN §4.3, "numeric specs only from the
// database"). The prompts forbid figures that are not in the supplied
// record; this is the check that enforces it. Any digit sequence in the
// model's text must match a number that was in the input.

const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g

export function numbersIn(text: string): number[] {
  return (text.match(NUMBER) ?? []).map((token) =>
    Number(token.replaceAll(',', ''))
  )
}

function collect(value: unknown, into: number[]): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    into.push(Math.abs(value))
  } else if (typeof value === 'string') {
    into.push(...numbersIn(value))
  } else if (Array.isArray(value)) {
    for (const item of value) collect(item, into)
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collect(item, into)
  }
}

const round = (n: number, places: number) => {
  const factor = 10 ** places
  return Math.round(n * factor) / factor
}

// Every number in the input, plus the harmless restatements an engineer would
// write: rounded values, and Hz written as kHz.
export function allowedNumbers(
  input: unknown,
  extra: Iterable<number> = []
): Set<number> {
  const raw: number[] = []
  collect(input, raw)
  // `extra` are values the caller has already validated as legitimate (for
  // example a placement distance the model chose from a supplied range).
  // They are allowed exactly as given; the caller adds any restatements.
  const allowed = new Set<number>(extra)
  for (const n of raw) {
    allowed.add(n)
    allowed.add(round(n, 0))
    allowed.add(round(n, 1))
    if (n >= 1000) {
      allowed.add(n / 1000)
      allowed.add(round(n / 1000, 1))
    }
  }
  return allowed
}

export function collectStrings(value: unknown, into: string[] = []): string[] {
  if (typeof value === 'string') into.push(value)
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, into))
  else if (value && typeof value === 'object') {
    Object.values(value).forEach((v) => collectStrings(v, into))
  }
  return into
}

// Returns the numbers in `output` that do not appear in `input`.
export function findUngroundedNumbers(
  output: unknown,
  input: unknown,
  extra: Iterable<number> = []
): number[] {
  const allowed = allowedNumbers(input, extra)
  const found = new Set<number>()
  for (const text of collectStrings(output)) {
    for (const n of numbersIn(text)) if (!allowed.has(n)) found.add(n)
  }
  return [...found]
}

export function groundingProblems(
  output: unknown,
  input: unknown,
  extra: Iterable<number> = []
): string[] {
  return findUngroundedNumbers(output, input, extra).map(
    (n) =>
      `The text contains the number ${n}, which is not in the supplied data. Remove it or describe it in words.`
  )
}
