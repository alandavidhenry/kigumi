// Response-header helpers shared by route handlers.

// A Content-Disposition value that is safe whatever the stored file name holds:
// an ASCII fallback with anything unusual replaced, plus the RFC 5987 UTF-8
// form so real names still survive. Quotes, backslashes, control characters and
// header-splitting newlines never reach the header.
export function contentDisposition(
  type: 'inline' | 'attachment',
  fileName: string
): string {
  const cleaned = [...fileName]
    .filter((c) => c.charCodeAt(0) > 0x1f && c.charCodeAt(0) !== 0x7f)
    .join('')
    .trim()
  const name = cleaned || 'file'
  const ascii = name.replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 150)
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  )
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

// Headers for serving a user-uploaded file from the app's own origin. The type
// was confirmed by magic bytes on upload; these stop a crafted file being
// treated as a page. Images stay inline (they are shown in <img>) under a CSP
// that runs nothing. PDFs are downloaded rather than opened in a tab: a PDF
// viewer can run script and Chrome refuses to render one under CSP `sandbox`.
export function uploadedFileHeaders(
  mimeType: string,
  fileName: string
): Record<string, string> {
  const isImage = mimeType.startsWith('image/')
  return {
    'content-type': mimeType,
    'content-disposition': contentDisposition(
      isImage ? 'inline' : 'attachment',
      fileName
    ),
    'content-security-policy': "default-src 'none'; sandbox",
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin',
    'cache-control': 'private, max-age=3600'
  }
}
