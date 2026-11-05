'use client'

import { FileText, Paperclip } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'
import { apiFetch } from '@/lib/client-api'
import { formatBytes } from '@/lib/maintenance/format'
import type { DueState } from '@/lib/maintenance/types'

type Tone = 'success' | 'warning' | 'destructive' | 'secondary'

const TONES: Record<string, Tone> = {
  ok: 'success',
  active: 'success',
  due_soon: 'warning',
  expiring: 'warning',
  overdue: 'destructive',
  failed: 'destructive',
  expired: 'destructive'
}

// One badge for every due/expiry state, so colour always means the same thing.
export function StateBadge({
  state,
  label
}: {
  readonly state: DueState | 'failed' | 'active' | 'expiring' | 'expired'
  readonly label: string
}) {
  return <Badge variant={TONES[state] ?? 'secondary'}>{label}</Badge>
}

export interface FileInfo {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
}

// Receipts and service documents: links open through the authenticated
// attachment route, never a public blob URL.
export function FileList({
  files,
  canManage,
  uploadUrl,
  label = 'Attach file'
}: {
  readonly files: FileInfo[]
  readonly canManage: boolean
  readonly uploadUrl: string
  readonly label?: string
}) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const response = await fetch(uploadUrl, { method: 'POST', body })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error ?? 'Upload failed')
      }
      toast({ title: 'File attached' })
      router.refresh()
    } catch (caught) {
      toast({
        title: caught instanceof Error ? caught.message : 'Upload failed',
        variant: 'destructive'
      })
    } finally {
      setUploading(false)
      if (input.current) input.current.value = ''
    }
  }

  const remove = (id: string) => async () => {
    await apiFetch(`/api/attachments/${id}`, { method: 'DELETE' })
    toast({ title: 'File removed' })
    router.refresh()
  }

  return (
    <div className='space-y-2'>
      {files.length > 0 && (
        <ul className='space-y-1'>
          {files.map((file) => (
            <li key={file.id} className='flex items-center gap-2 text-sm'>
              <FileText className='h-4 w-4 shrink-0 text-muted-foreground' />
              <Link
                href={`/api/attachments/${file.id}`}
                target='_blank'
                rel='noopener noreferrer'
                className='min-w-0 truncate text-brand hover:underline'
              >
                {file.fileName}
              </Link>
              <span className='shrink-0 text-xs text-muted-foreground'>
                {formatBytes(file.sizeBytes)}
              </span>
              {canManage && (
                <ConfirmDeleteButton
                  title={`Remove ${file.fileName}?`}
                  description='The file is permanently deleted.'
                  label='Remove file'
                  size='icon'
                  onConfirm={remove(file.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <>
          <input
            ref={input}
            type='file'
            accept='image/jpeg,image/png,image/webp,application/pdf'
            className='sr-only'
            aria-label={label}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void upload(file)
            }}
          />
          <Button
            type='button'
            variant='surface'
            size='sm'
            disabled={uploading}
            onClick={() => input.current?.click()}
          >
            <Paperclip />
            {uploading ? 'Uploading…' : label}
          </Button>
        </>
      )}
    </div>
  )
}

export interface ItemOption {
  id: string
  name: string
}

export function ItemSelect({
  id,
  value,
  onChange,
  items
}: {
  readonly id: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly items: ItemOption[]
}) {
  return (
    <select
      id={id}
      value={value}
      required
      onChange={(event) => onChange(event.target.value)}
      className='flex h-8 w-full rounded-md border border-input bg-field px-3 py-1 text-sm hover:border-border-strong focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring'
    >
      <option value=''>Choose an item…</option>
      {items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </select>
  )
}
