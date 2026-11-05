'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { FormError } from '@/components/auth/auth-card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/use-toast'

// One dialog shell for every maintenance form: owns open state, busy state and
// the error line, closes and refreshes the page on success. `onSubmit` throws
// to show a message (apiFetch already carries the server's text).
export function FormDialog({
  title,
  description,
  trigger,
  submitLabel = 'Save',
  successMessage,
  onOpen,
  onSubmit,
  children
}: {
  readonly title: string
  readonly description?: string
  readonly trigger: React.ReactNode
  readonly submitLabel?: string
  readonly successMessage?: string
  // Reset the caller's field state each time the dialog opens.
  readonly onOpen?: () => void
  readonly onSubmit: () => Promise<void>
  readonly children: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setError(null)
      onOpen?.()
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSubmit()
      setOpen(false)
      if (successMessage) toast({ title: successMessage })
      router.refresh()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Something went wrong'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className='max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} className='space-y-4'>
          {children}
          <FormError message={error} />
          <DialogFooter>
            <Button
              type='button'
              variant='surface'
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type='submit' disabled={busy}>
              {busy ? 'Saving…' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function FormField({
  label,
  htmlFor,
  hint,
  children
}: {
  readonly label: string
  readonly htmlFor: string
  readonly hint?: string
  readonly children: React.ReactNode
}) {
  return (
    <div className='space-y-1.5'>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className='text-xs text-muted-foreground'>{hint}</p>}
    </div>
  )
}

export const today = () => new Date().toISOString().slice(0, 10)
