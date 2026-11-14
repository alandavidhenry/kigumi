'use client'

import { Pencil, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { FormError } from '@/components/auth/auth-card'
import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
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
import { NativeSelect } from '@/components/ui/native-select'
import { toast } from '@/components/ui/use-toast'
import { apiFetch } from '@/lib/client-api'

export interface ConsoleRow {
  id: string
  name: string
  make: string | null
  model: string | null
  channelCount: number
  templateId: string
  templateName: string
}

export interface TemplateChoice {
  id: string
  name: string
}

const BUILTIN_PREFIX = 'builtin:'

// Adds or edits a console. A new console can copy the shipped generic desk (you
// then own an editable copy) or use a template you already defined.
export function ConsoleDialog({
  existing,
  builtIn,
  templates,
  trigger
}: {
  readonly existing?: ConsoleRow
  readonly builtIn: TemplateChoice[]
  readonly templates: TemplateChoice[]
  readonly trigger: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(existing?.name ?? '')
  const [make, setMake] = useState(existing?.make ?? '')
  const [model, setModel] = useState(existing?.model ?? '')
  const [channels, setChannels] = useState(String(existing?.channelCount ?? 24))
  const [template, setTemplate] = useState(
    existing?.templateId ??
      (builtIn[0]
        ? `${BUILTIN_PREFIX}${builtIn[0].id}`
        : (templates[0]?.id ?? ''))
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const body = {
        name,
        make,
        model,
        channelCount: Number(channels)
      }
      if (existing) {
        await apiFetch(`/api/consoles/${existing.id}`, {
          method: 'PATCH',
          body: {
            ...body,
            ...(template !== existing.templateId &&
              !template.startsWith(BUILTIN_PREFIX) && { templateId: template })
          }
        })
      } else {
        await apiFetch('/api/consoles', {
          method: 'POST',
          body: {
            ...body,
            ...(template.startsWith(BUILTIN_PREFIX)
              ? { builtinTemplateId: template.slice(BUILTIN_PREFIX.length) }
              : { templateId: template })
          }
        })
      }
      toast({ title: existing ? 'Console saved' : 'Console added' })
      setOpen(false)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className='space-y-4'>
          <DialogHeader>
            <DialogTitle>
              {existing ? 'Edit console' : 'Add a console'}
            </DialogTitle>
            <DialogDescription>
              The channel-strip template decides which controls a recall sheet
              records for each channel.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-1'>
            <Label htmlFor='console-name'>Name</Label>
            <Input
              id='console-name'
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-1'>
              <Label htmlFor='console-make'>Make</Label>
              <Input
                id='console-make'
                maxLength={60}
                value={make}
                onChange={(e) => setMake(e.target.value)}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='console-model'>Model</Label>
              <Input
                id='console-model'
                maxLength={60}
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-1'>
              <Label htmlFor='console-channels'>Channels</Label>
              <Input
                id='console-channels'
                type='number'
                min={1}
                max={128}
                required
                value={channels}
                onChange={(e) => setChannels(e.target.value)}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='console-template'>Channel strip</Label>
              <NativeSelect
                id='console-template'
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              >
                {!existing &&
                  builtIn.map((t) => (
                    <option key={t.id} value={`${BUILTIN_PREFIX}${t.id}`}>
                      {t.name} (copy of the shipped template)
                    </option>
                  ))}
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <FormError message={error} />
          <DialogFooter>
            <Button type='submit' disabled={busy}>
              {busy ? 'Saving…' : existing ? 'Save' : 'Add console'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ConsoleRowActions({
  console: row,
  builtIn,
  templates,
  canEdit
}: {
  readonly console: ConsoleRow
  readonly builtIn: TemplateChoice[]
  readonly templates: TemplateChoice[]
  readonly canEdit: boolean
}) {
  const router = useRouter()
  if (!canEdit) return null
  return (
    <div className='flex items-center gap-1'>
      <ConsoleDialog
        existing={row}
        builtIn={builtIn}
        templates={templates}
        trigger={
          <Button variant='surface' size='icon' aria-label={`Edit ${row.name}`}>
            <Pencil />
          </Button>
        }
      />
      <ConfirmDeleteButton
        title={`Delete ${row.name}?`}
        description='Recall sheets already written keep their own copy of this desk.'
        label={`Delete ${row.name}`}
        size='icon'
        onConfirm={async () => {
          await apiFetch(`/api/consoles/${row.id}`, { method: 'DELETE' })
          toast({ title: 'Console deleted' })
          router.refresh()
        }}
      />
    </div>
  )
}

export function AddConsoleButton({
  builtIn,
  templates
}: {
  readonly builtIn: TemplateChoice[]
  readonly templates: TemplateChoice[]
}) {
  return (
    <ConsoleDialog
      builtIn={builtIn}
      templates={templates}
      trigger={
        <Button>
          <Plus /> Add console
        </Button>
      }
    />
  )
}
