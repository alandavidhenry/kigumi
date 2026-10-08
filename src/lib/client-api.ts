// Browser-side JSON fetch for Kigumi's API routes. Throws an Error carrying
// the server's message so forms can show it directly.
export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly details?: unknown

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export async function apiFetch<T = unknown>(
  url: string,
  { method = 'GET', body }: { method?: string; body?: unknown } = {}
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers:
      body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })

  if (response.status === 204) return undefined as T

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new ApiError(
      data.error ?? 'Something went wrong',
      response.status,
      data.code,
      data.details
    )
  }
  return data as T
}
