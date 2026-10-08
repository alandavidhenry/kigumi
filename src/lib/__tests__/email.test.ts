import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  escapeHtml,
  sendEmail,
  sendInvitationEmail,
  sendPasswordResetEmail,
  sendVerificationEmail
} from '@/lib/email'

const pollUntilDone = vi.fn()
const beginSend = vi.fn(async () => ({ pollUntilDone }))

vi.mock('@azure/communication-email', () => ({
  EmailClient: vi.fn(function EmailClient() {
    return { beginSend }
  })
}))

const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

function configureAcs() {
  vi.stubEnv('AZURE_COMMUNICATION_CONNECTION_STRING', 'endpoint=x')
  vi.stubEnv('ACS_SENDER_ADDRESS', 'DoNotReply@kigumi.test')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('AZURE_COMMUNICATION_CONNECTION_STRING', '')
  vi.stubEnv('ACS_SENDER_ADDRESS', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('escapeHtml', () => {
  it('escapes markup characters', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;'
    )
  })
})

describe('sendEmail', () => {
  const message = { to: 'a@b.c', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' }

  it('logs instead of sending in development without ACS', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    await sendEmail(message)
    expect(beginSend).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('a@b.c'))
  })

  it('refuses in production without ACS', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    await expect(sendEmail(message)).rejects.toThrow('not configured')
  })

  it('sends through ACS when configured', async () => {
    configureAcs()
    await sendEmail(message)
    expect(beginSend).toHaveBeenCalledWith({
      senderAddress: 'DoNotReply@kigumi.test',
      recipients: { to: [{ address: 'a@b.c' }] },
      content: { subject: 'Hi', html: '<p>Hi</p>', plainText: 'Hi' }
    })
    expect(pollUntilDone).toHaveBeenCalled()
  })
})

describe('templated emails', () => {
  beforeEach(configureAcs)

  function lastContent() {
    const calls = beginSend.mock.calls as unknown as [
      { content: { subject: string; html: string; plainText: string } }
    ][]
    return calls[calls.length - 1][0].content
  }

  it('sends verification emails with the link', async () => {
    await sendVerificationEmail('a@b.c', 'Ada', 'https://x/verify?t=1')
    expect(lastContent().subject).toBe('Verify your email for Kigumi')
    expect(lastContent().plainText).toContain('https://x/verify?t=1')
  })

  it('sends password reset emails', async () => {
    await sendPasswordResetEmail('a@b.c', 'Ada', 'https://x/reset')
    expect(lastContent().subject).toBe('Reset your Kigumi password')
  })

  it('escapes user-supplied names in invitation HTML', async () => {
    await sendInvitationEmail(
      'a@b.c',
      '<script>Eve</script>',
      'Abbey & Co',
      'Engineer',
      'https://x/invite/1'
    )
    const { subject, html } = lastContent()
    expect(subject).toBe(
      '<script>Eve</script> invited you to Abbey & Co on Kigumi'
    )
    expect(html).toContain('&lt;script&gt;Eve&lt;/script&gt;')
    expect(html).toContain('Abbey &amp; Co')
    expect(html).not.toContain('<script>')
  })
})
