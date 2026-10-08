import { PublicChrome } from '@/components/public-chrome'

export default function AuthLayout({
  children
}: {
  readonly children: React.ReactNode
}) {
  return <PublicChrome>{children}</PublicChrome>
}
