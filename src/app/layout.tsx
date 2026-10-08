import { Plus_Jakarta_Sans, Source_Code_Pro } from 'next/font/google'

import { BreadcrumbProvider } from '@/components/providers/breadcrumb-provider'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { Toaster } from '@/components/ui/toaster'

import type { Metadata, Viewport } from 'next'

import './globals.css'

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta-sans'
})

const sourceCodePro = Source_Code_Pro({
  subsets: ['latin'],
  variable: '--font-source-code-pro'
})

export const metadata: Metadata = {
  title: { default: 'Kigumi', template: '%s · Kigumi' },
  description:
    'Plan recording sessions around the gear your studio actually owns.'
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1
}

/*
  Applies the stored theme class before first paint. Without this the provider
  would only resolve the theme in an effect, flashing the light palette on every
  load now that dark is the default.
*/
const themeScript = `
try {
  var t = localStorage.getItem('theme') || 'dark'
  if (t === 'system') {
    t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  document.documentElement.classList.add(t === 'light' ? 'light' : 'dark')
} catch (e) {
  document.documentElement.classList.add('dark')
}
`.trim()

export default function RootLayout({
  children
}: {
  readonly children: React.ReactNode
}) {
  return (
    <html lang='en-GB' suppressHydrationWarning>
      <head>
        <meta name='color-scheme' content='dark light' />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${plusJakartaSans.variable} ${sourceCodePro.variable} font-sans`}
      >
        <ThemeProvider>
          <BreadcrumbProvider>{children}</BreadcrumbProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
