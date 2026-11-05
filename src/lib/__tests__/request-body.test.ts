import { describe, expect, it } from 'vitest'

import { isAppError } from '@/lib/errors'
import {
  MAX_MULTIPART_BYTES,
  readBody,
  readJson,
  readText,
  readUploadedFile
} from '@/lib/request-body'

function post(body: BodyInit | null, headers: Record<string, string> = {}) {
  return new Request('http://x/api', { method: 'POST', body, headers })
}

// A body with no Content-Length, delivered in chunks, that counts how much of
// it was pulled.
function chunked(chunkBytes: number, chunks: number) {
  let sent = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= chunks) return controller.close()
      sent++
      controller.enqueue(new Uint8Array(chunkBytes))
    }
  })
  const request = new Request('http://x/api', {
    method: 'POST',
    body: stream,
    duplex: 'half'
  } as RequestInit)
  return { request, pulled: () => sent }
}

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise
    return 'ok'
  } catch (error) {
    return isAppError(error) ? `${error.code}:${error.status}` : 'other'
  }
}

describe('readBody', () => {
  it('reads a body inside the limit', async () => {
    const body = await readBody(post('hello'), 10)
    expect(new TextDecoder().decode(body)).toBe('hello')
  })

  it('refuses on Content-Length before reading anything', async () => {
    const request = post('x', { 'content-length': '999999999' })
    expect(await codeOf(readBody(request, 1024))).toBe('PAYLOAD_TOO_LARGE:413')
    expect(request.bodyUsed).toBe(false)
  })

  it('stops a chunked body as soon as it passes the limit', async () => {
    const { request, pulled } = chunked(1024, 1000)
    expect(await codeOf(readBody(request, 4 * 1024))).toBe(
      'PAYLOAD_TOO_LARGE:413'
    )
    expect(pulled()).toBeLessThan(10)
  })

  it('treats a missing body as empty', async () => {
    expect((await readBody(post(null), 10)).byteLength).toBe(0)
  })
})

describe('readJson', () => {
  it('parses JSON and turns malformed JSON into an empty object', async () => {
    expect(await readJson(post('{"a":1}'))).toEqual({ a: 1 })
    expect(await readJson(post('{oops'))).toEqual({})
    expect(await readJson(post(''))).toEqual({})
  })

  it('is a 413, not an empty object, when too large', async () => {
    expect(await codeOf(readJson(post('{"a":"long"}'), 4))).toBe(
      'PAYLOAD_TOO_LARGE:413'
    )
  })
})

describe('readText', () => {
  it('decodes UTF-8', async () => {
    expect(await readText(post('make,model\nNeumann,U 87 Ai'), 100)).toBe(
      'make,model\nNeumann,U 87 Ai'
    )
  })
})

describe('readUploadedFile', () => {
  it('returns the file field', async () => {
    const form = new FormData()
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'a.png'))
    const file = await readUploadedFile(post(form), 'Choose a file')
    expect(file.name).toBe('a.png')
    expect([...file.data]).toEqual([1, 2, 3])
  })

  it('is a 400 with the given message when there is no file', async () => {
    const error = await readUploadedFile(post(new FormData()), 'Choose a file')
      .then(() => null)
      .catch((caught: unknown) => caught)
    expect(isAppError(error) && error.status).toBe(400)
    expect((error as Error).message).toBe('Choose a file')
  })

  it('refuses an upload over the multipart cap', async () => {
    // Raw bytes rather than FormData: undici's FormData body keeps writing
    // after the reader is cancelled, which only happens in tests.
    const request = post(new Uint8Array(MAX_MULTIPART_BYTES + 1), {
      'content-type': 'multipart/form-data; boundary=x'
    })
    expect(await codeOf(readUploadedFile(request, 'Choose a file'))).toBe(
      'PAYLOAD_TOO_LARGE:413'
    )
  })
})
