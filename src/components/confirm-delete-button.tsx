'use client'

import { Trash2 } from 'lucide-react'
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

// In-app confirmation (never window.confirm) for destructive actions.
export function ConfirmDeleteButton({
  title,
  description,
  confirmLabel = 'Delete',
  onConfirm,
  label,
  size = 'sm'
}: {
  readonly title: string
  readonly description: string
  readonly confirmLabel?: string
  readonly onConfirm: () => Promise<void>
  readonly label?: string
  readonly size?: 'sm' | 'icon' | 'default'
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      setOpen(false)
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Something went wrong'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant='ghost'
          size={size}
          aria-label={label ?? title}
          className='text-destructive hover:text-destructive'
        >
          <Trash2 />
          {label && size !== 'icon' && label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <FormError message={error} />
        <DialogFooter>
          <Button variant='surface' onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant='destructive'
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
