'use client'

import { Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/use-toast'
import type { ImportRowError } from '@/lib/equipment-io'

export function ImportDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<ImportRowError[]>([])

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setFile(null)
      setMessage(null)
      setRowErrors([])
    }
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!file) return
    setBusy(true)
    setMessage(null)
    setRowErrors([])
    try {
      const response = await fetch('/api/equipment/import', {
        method: 'POST',
        headers: { 'content-type': 'text/csv' },
        body: await file.text()
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage(data.error ?? 'Import failed')
        setRowErrors(data.details?.errors ?? [])
        return
      }
      setOpen(false)
      toast({ title: `Imported ${data.imported} items` })
      router.refresh()
    } catch {
      setMessage('Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant='surface'>
          <Upload />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className='space-y-4'>
          <DialogHeader>
            <DialogTitle>Import equipment</DialogTitle>
            <DialogDescription>
              Upload a CSV with columns category, make, model and optionally
              serial, quantity, status, room, purchase_date, purchase_price,
              supplier, tags (separated by ;) and notes. Nothing is imported
              unless every row is valid.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-2'>
            <Label htmlFor='import-file'>CSV file</Label>
            <Input
              id='import-file'
              type='file'
              accept='.csv,text/csv'
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              required
            />
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              className='text-xs text-muted-foreground underline'
              href='/api/equipment/export'
            >
              Download your current inventory as a template
            </a>
          </div>
          {message && (
            <div role='alert' className='text-sm text-destructive'>
              <p>{message}</p>
              {rowErrors.length > 0 && (
                <ul className='mt-1 max-h-40 list-disc overflow-y-auto pl-5'>
                  {rowErrors.map((rowError) => (
                    <li key={`${rowError.row}-${rowError.message}`}>
                      Row {rowError.row}: {rowError.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              type='button'
              variant='surface'
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type='submit' disabled={busy || !file}>
              {busy ? 'Importing…' : 'Import'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
