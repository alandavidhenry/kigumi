// Studio-local time to UTC and back, using Intl only (no date library).
// Sessions are stored in UTC and shown in the studio's IANA timezone.

const partsFormat = (timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

export interface LocalParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export function utcToLocalParts(date: Date, timeZone: string): LocalParts {
  const map: Record<string, number> = {}
  for (const part of partsFormat(timeZone).formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = Number(part.value)
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second
  }
}

// Offset (ms) of `timeZone` from UTC at an instant.
function offsetAt(date: Date, timeZone: string): number {
  const p = utcToLocalParts(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/

// '2026-03-29T01:30' in Europe/London to a UTC Date. A time that doesn't
// exist (spring-forward gap) moves forward by the gap; a repeated time (autumn)
// takes the first occurrence.
export function localToUtc(local: string, timeZone: string): Date | null {
  const m = LOCAL_RE.exec(local)
  if (!m) return null
  const [y, mo, d, h, mi] = m.slice(1).map(Number)
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  // Reject dates that rolled over (e.g. month 13 or 31 February).
  const check = new Date(guess)
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d
  ) {
    return null
  }
  const DAY = 24 * 3_600_000
  const before = offsetAt(new Date(guess - DAY), timeZone)
  const after = offsetAt(new Date(guess + DAY), timeZone)
  const matches = (t: number) => {
    const p = utcToLocalParts(new Date(t), timeZone)
    return (
      p.year === y &&
      p.month === mo &&
      p.day === d &&
      p.hour === h &&
      p.minute === mi
    )
  }
  const valid = [...new Set([before, after])]
    .map((offset) => guess - offset)
    .filter(matches)
    .sort((a, b) => a - b)
  return new Date(valid.length > 0 ? valid[0] : guess - before)
}

export function formatLocalInput(date: Date, timeZone: string): string {
  const p = utcToLocalParts(date, timeZone)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

// The whole of a calendar day ('YYYY-MM-DD') in a timezone, as UTC instants.
export function dayWindow(
  day: string,
  timeZone: string
): { start: Date; end: Date } | null {
  const start = localToUtc(`${day}T00:00`, timeZone)
  if (!start) return null
  const next = new Date(
    Date.UTC(
      Number(day.slice(0, 4)),
      Number(day.slice(5, 7)) - 1,
      Number(day.slice(8, 10)) + 1
    )
  )
  const nextDay = next.toISOString().slice(0, 10)
  const end = localToUtc(`${nextDay}T00:00`, timeZone)
  return end ? { start, end } : null
}

export function formatSessionTime(
  startsAt: Date,
  endsAt: Date,
  timeZone: string
): string {
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(startsAt)
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  })
  return `${date}, ${time.format(startsAt)} to ${time.format(endsAt)}`
}
