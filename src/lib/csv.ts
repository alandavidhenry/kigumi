// Minimal RFC 4180 CSV reader/writer. Exports neutralise spreadsheet formula
// injection by prefixing risky cells with an apostrophe.

const FORMULA_PREFIX = /^[=+\-@\t\r]/

export function escapeCsvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (typeof value === 'string' && FORMULA_PREFIX.test(text)) {
    text = `'${text}`
  }
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(
  header: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>
): string {
  const lines = [header, ...rows].map((row) => row.map(escapeCsvCell).join(','))
  return `${lines.join('\r\n')}\r\n`
}

// Returns rows of cells. Handles quoted cells, escaped quotes, embedded
// newlines, CRLF/LF and a leading BOM. Fully blank lines are skipped.
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  const endCell = () => {
    row.push(cell)
    cell = ''
  }
  const endRow = () => {
    endCell()
    if (row.some((value) => value.trim() !== '')) rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
    } else if (char === '"' && cell === '') {
      quoted = true
    } else if (char === ',') {
      endCell()
    } else if (char === '\n') {
      endRow()
    } else if (char === '\r') {
      if (text[i + 1] === '\n') i++
      endRow()
    } else {
      cell += char
    }
  }
  if (cell !== '' || row.length > 0) endRow()
  return rows
}
