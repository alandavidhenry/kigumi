import { badRequest, payloadTooLarge } from '@/lib/errors'
import { MAX_FILE_BYTES } from '@/lib/maintenance/types'

// Bounded request-body reading for route handlers. Next does not cap route
// handler bodies, and request.json() / text() / formData() buffer the whole
// thing before any of our size checks run, so one oversized request could
// exhaust the instance's memory for every tenant. Everything that reads a body
// goes through readBody: it refuses on Content-Length before reading, and stops
// as soon as the running total passes the limit (for chunked bodies or a
// Content-Length that lies).

export const MAX_JSON_BYTES = 1024 * 1024
// The catalogue admin API carries digitised frequency and polar curves.
export const MAX_ADMIN_JSON_BYTES = 5 * 1024 * 1024
export const MAX_CSV_BYTES = 2 * 1024 * 1024
// The largest single upload any owner accepts, plus room for multipart framing.
// Per-type limits (5 MB photos, 8 MB documents) are still checked on the file.
export const MAX_MULTIPART_BYTES = MAX_FILE_BYTES + 256 * 1024

export async function readBody(
  request: Request,
  maxBytes: number
): Promise<Uint8Array> {
  const declared = request.headers.get('content-length')
  if (declared !== null && Number(declared) > maxBytes) {
    throw payloadTooLarge(maxBytes)
  }
  if (!request.body) return new Uint8Array(0)

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw payloadTooLarge(maxBytes)
    }
    chunks.push(value)
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export async function readText(
  request: Request,
  maxBytes: number
): Promise<string> {
  return new TextDecoder().decode(await readBody(request, maxBytes))
}

// Malformed JSON becomes an empty object so schema validation reports the
// problem consistently; an oversized body is a 413.
export async function readJson(
  request: Request,
  maxBytes = MAX_JSON_BYTES
): Promise<unknown> {
  const text = await readText(request, maxBytes)
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

// The `file` field of a multipart upload, read within the multipart cap.
export async function readUploadedFile(
  request: Request,
  missingMessage: string
): Promise<{ name: string; type: string; data: Buffer }> {
  const body = await readBody(request, MAX_MULTIPART_BYTES)
  const contentType = request.headers.get('content-type') ?? ''
  const form = await new Response(body as BodyInit, {
    headers: { 'content-type': contentType }
  })
    .formData()
    .catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) throw badRequest(missingMessage)
  return {
    name: file.name,
    type: file.type,
    data: Buffer.from(await file.arrayBuffer())
  }
}
