import {
  Card,
  CardContent,
  CardDescription,
  CardHeader
} from '@/components/ui/card'

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
      <Card className='w-full max-w-md'>
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
    <div
      role='alert'
      className='rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive'
    >
      {message}
    </div>
  )
}

export function FormNotice({
  children
}: {
  readonly children: React.ReactNode
}) {
  return (
    <div
      role='status'
      className='rounded-md border border-success/30 bg-success/10 p-3 text-sm text-foreground'
    >
      {children}
    </div>
  )
}
