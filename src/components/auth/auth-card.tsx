import {
  Card,
  CardContent,
  CardDescription,
  CardHeader
} from '@/components/ui/card'
import { Notice } from '@/components/ui/notice'

export function AuthCard({
  title,
  description,
  children
}: {
  readonly title: string
  readonly description?: React.ReactNode
  readonly children: React.ReactNode
}) {
  return (
    <div className='flex flex-1 items-center justify-center px-4 py-10'>
      <Card className='w-full max-w-md rounded-2xl p-2 md:p-4'>
        <CardHeader>
          {/* A real h1: auth pages have no other page heading. */}
          <h1 className='text-base font-semibold leading-none tracking-tight'>
            {title}
          </h1>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  )
}

export function FormError({ message }: { readonly message?: string | null }) {
  if (!message) return null
  return (
    <Notice role='alert' variant='destructive' className='text-destructive'>
      {message}
    </Notice>
  )
}

export function FormNotice({
  children
}: {
  readonly children: React.ReactNode
}) {
  return (
    <Notice role='status' variant='success'>
      {children}
    </Notice>
  )
}
