import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes
} from 'node:crypto'

// Small at-rest protection for bearer tokens the app must be able to show again
// (share links). Lookups use a SHA-256 hash, so a database leak alone neither
// reveals nor validates a token. The display copy is AES-256-GCM encrypted
// under a key derived from BETTER_AUTH_SECRET, which lives outside the
// database. Rotating that secret leaves old links working but unreadable; the
// UI then offers a new link instead of showing the old one.

// The tokens are 32 random bytes, so an unsalted hash is not guessable.
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

function keyFor(purpose: string): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set')
  return Buffer.from(hkdfSync('sha256', secret, 'kigumi', purpose, 32))
}

export function sealToken(token: string, purpose: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFor(purpose), iv)
  const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')
}

// Null when the value was sealed under another secret or has been tampered with.
export function openToken(sealed: string, purpose: string): string | null {
  try {
    const raw = Buffer.from(sealed, 'base64url')
    if (raw.length < 29) return null
    const decipher = createDecipheriv(
      'aes-256-gcm',
      keyFor(purpose),
      raw.subarray(0, 12)
    )
    decipher.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([
      decipher.update(raw.subarray(28)),
      decipher.final()
    ]).toString('utf8')
  } catch {
    return null
  }
}
