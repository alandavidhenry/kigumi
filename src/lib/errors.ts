// Typed errors thrown by src/lib and turned into HTTP responses by
// toErrorResponse (src/lib/api.ts). Cross-tenant access deliberately surfaces
// as NOT_FOUND so ids from other organisations don't leak (ADR 0003).

export type AppErrorCode =
  | 'UNAUTHORIZED'
  | 'NO_ACTIVE_ORGANISATION'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'PLAN_LIMIT'
  | 'BAD_REQUEST'
  | 'CROSS_TENANT'

const STATUS_BY_CODE: Readonly<Record<AppErrorCode, number>> = {
  UNAUTHORIZED: 401,
  NO_ACTIVE_ORGANISATION: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  PLAN_LIMIT: 403,
  BAD_REQUEST: 400,
  CROSS_TENANT: 404
}

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly status: number
  readonly details?: unknown

  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = STATUS_BY_CODE[code]
    this.details = details
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

export const unauthorized = () =>
  new AppError('UNAUTHORIZED', 'You need to sign in to do that')

export const forbidden = (message = 'You do not have permission to do that') =>
  new AppError('FORBIDDEN', message)

export const notFound = (entity = 'Resource') =>
  new AppError('NOT_FOUND', `${entity} not found`)

export const planLimit = (resource: string, limit: number) =>
  new AppError(
    'PLAN_LIMIT',
    `Your plan allows ${limit} ${resource}. Upgrade to add more.`,
    { resource, limit }
  )

export const badRequest = (message: string, details?: unknown) =>
  new AppError('BAD_REQUEST', message, details)
