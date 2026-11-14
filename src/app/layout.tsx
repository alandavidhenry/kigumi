import { Plus_Jakarta_Sans, Source_Code_Pro } from 'next/font/google'

import { BreadcrumbProvider } from '@/components/providers/breadcrumb-provider'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { SkipLink } from '@/components/skip-link'
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
  Applies the theme class before first paint: the stored choice if there is
  one, otherwise the system setting. Without this the provider would only
  resolve the theme in an effect, flashing the wrong palette on load.
*/
const themeScript = `
var t = null
try {
  t = localStorage.getItem('theme')
} catch (e) {}
if (t !== 'light' && t !== 'dark') {
  t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
document.documentElement.classList.add(t)
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
        <SkipLink />
        <ThemeProvider>
          <BreadcrumbProvider>{children}</BreadcrumbProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
