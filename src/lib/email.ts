import { EmailClient } from '@azure/communication-email'

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isEmailConfigured() {
  return Boolean(
    process.env.AZURE_COMMUNICATION_CONNECTION_STRING &&
    process.env.ACS_SENDER_ADDRESS
  )
}

// Sends via Azure Communication Services. Without ACS configured, development
// logs the message (so verification/invite links can be followed locally) and
// production refuses rather than silently dropping mail.
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (!isEmailConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Email is not configured (ACS connection string/sender)')
    }
    console.warn(
      `[email] ACS not configured — would send to ${message.to}: ${message.subject}\n${message.text}`
    )
    return
  }

  const client = new EmailClient(
    process.env.AZURE_COMMUNICATION_CONNECTION_STRING!
  )
  const poller = await client.beginSend({
    senderAddress: process.env.ACS_SENDER_ADDRESS!,
    recipients: { to: [{ address: message.to }] },
    content: {
      subject: message.subject,
      html: message.html,
      plainText: message.text
    }
  })
  await poller.pollUntilDone()
}

function layout(
  heading: string,
  body: string,
  actionLabel: string,
  url: string
) {
  const safeUrl = escapeHtml(url)
  return `
    <div style="font-family: system-ui, sans-serif; max-width: 520px">
      <h2>${escapeHtml(heading)}</h2>
      ${body}
      <p><a href="${safeUrl}">${escapeHtml(actionLabel)}</a></p>
      <p style="color: #666; font-size: 12px">If the link doesn't work, paste this into your browser: ${safeUrl}</p>
    </div>
  `
}

export async function sendVerificationEmail(
  to: string,
  name: string,
  url: string
): Promise<void> {
  await sendEmail({
    to,
    subject: 'Verify your email for Kigumi',
    html: layout(
      'Confirm your email',
      `<p>Hi ${escapeHtml(name)}, confirm your email address to finish setting up your Kigumi account.</p>`,
      'Verify email',
      url
    ),
    text: `Hi ${name}, verify your email for Kigumi: ${url}`
  })
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  url: string
): Promise<void> {
  await sendEmail({
    to,
    subject: 'Reset your Kigumi password',
    html: layout(
      'Reset your password',
      `<p>Hi ${escapeHtml(name)}, someone asked to reset your Kigumi password. If it wasn't you, ignore this email.</p>`,
      'Choose a new password',
      url
    ),
    text: `Hi ${name}, reset your Kigumi password: ${url}`
  })
}

export async function sendInvitationEmail(
  to: string,
  inviterName: string,
  organisationName: string,
  role: string,
  url: string
): Promise<void> {
  await sendEmail({
    to,
    subject: `${inviterName} invited you to ${organisationName} on Kigumi`,
    html: layout(
      `Join ${organisationName}`,
      `<p>${escapeHtml(inviterName)} invited you to join <strong>${escapeHtml(organisationName)}</strong> on Kigumi as ${escapeHtml(role)}.</p>`,
      'Accept invitation',
      url
    ),
    text: `${inviterName} invited you to join ${organisationName} on Kigumi as ${role}: ${url}`
  })
}
