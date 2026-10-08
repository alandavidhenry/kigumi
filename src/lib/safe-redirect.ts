// Only allow same-origin relative paths as post-auth redirect targets, so a
// crafted ?callbackUrl= can't bounce users to another site.
export function safeCallbackUrl(
  value: string | null | undefined,
  fallback = '/dashboard'
): string {
  if (!value) return fallback
  if (!value.startsWith('/') || value.startsWith('//')) return fallback
  if (value.includes('\\')) return fallback
  return value
}
