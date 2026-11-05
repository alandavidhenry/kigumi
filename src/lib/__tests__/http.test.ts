import { describe, expect, it } from 'vitest'

import { contentDisposition, uploadedFileHeaders } from '@/lib/http'

describe('contentDisposition', () => {
  it('keeps a plain name in both forms', () => {
    expect(contentDisposition('attachment', 'invoice.pdf')).toBe(
      `attachment; filename="invoice.pdf"; filename*=UTF-8''invoice.pdf`
    )
  })

  it('cannot break out of the quoted name or split the header', () => {
    const value = contentDisposition(
      'inline',
      'a"; filename=evil.html\r\nSet-Cookie: x=1' +
        String.fromCharCode(92) +
        '.jpg'
    )
    expect(value).not.toMatch(/[\r\n]/)
    const ascii = value.match(/filename="([^"]*)"/)?.[1]
    expect(ascii).toBe('a__ filename_evil.htmlSet-Cookie_ x_1_.jpg')
    expect(value.split('filename="').length).toBe(2)
  })

  it('keeps non-ASCII names in the UTF-8 form', () => {
    const value = contentDisposition('attachment', 'Ölmühle quote.pdf')
    expect(value).toContain('filename="_lm_hle quote.pdf"')
    expect(value).toContain(
      `filename*=UTF-8''${encodeURIComponent('Ölmühle quote.pdf')}`
    )
  })

  it('falls back to a name when nothing is left', () => {
    expect(contentDisposition('inline', '\u0000 ')).toContain('filename="file"')
  })
})

describe('uploadedFileHeaders', () => {
  it('serves images inline under a CSP that runs nothing', () => {
    const headers = uploadedFileHeaders('image/png', 'desk.png')
    expect(headers['content-type']).toBe('image/png')
    expect(headers['content-disposition']).toMatch(/^inline;/)
    expect(headers['content-security-policy']).toBe(
      "default-src 'none'; sandbox"
    )
    expect(headers['x-content-type-options']).toBe('nosniff')
  })

  it('downloads PDFs instead of opening them in the app origin', () => {
    const headers = uploadedFileHeaders('application/pdf', 'receipt.pdf')
    expect(headers['content-disposition']).toMatch(/^attachment;/)
    expect(headers['cross-origin-resource-policy']).toBe('same-origin')
  })
})
