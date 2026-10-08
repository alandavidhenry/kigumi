import { describe, expect, it } from 'vitest'

import { escapeCsvCell, parseCsv, toCsv } from '@/lib/csv'

describe('escapeCsvCell', () => {
  it('quotes cells containing commas, quotes or newlines', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"')
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""')
    expect(escapeCsvCell('a\nb')).toBe('"a\nb"')
  })

  it('renders null and undefined as empty', () => {
    expect(escapeCsvCell(null)).toBe('')
    expect(escapeCsvCell(undefined)).toBe('')
  })

  it('neutralises spreadsheet formulas in text but not numbers', () => {
    expect(escapeCsvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(escapeCsvCell('@cmd')).toBe("'@cmd")
    expect(escapeCsvCell('+1')).toBe("'+1")
    expect(escapeCsvCell(-5)).toBe('-5')
  })
})

describe('toCsv / parseCsv', () => {
  it('round-trips awkward values', () => {
    const rows = [['Neumann', 'U 87, "Ai"', 'line1\nline2']]
    const csv = toCsv(['make', 'model', 'notes'], rows)
    expect(parseCsv(csv)).toEqual([['make', 'model', 'notes'], ...rows])
  })

  it('handles CRLF, a BOM and blank lines', () => {
    expect(parseCsv('﻿a,b\r\n\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })

  it('keeps empty cells and a final line without a newline', () => {
    expect(parseCsv('a,,c\n1,2,')).toEqual([
      ['a', '', 'c'],
      ['1', '2', '']
    ])
  })
})
