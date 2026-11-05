'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { FormError } from '@/components/auth/auth-card'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { toast } from '@/components/ui/use-toast'
import { apiFetch } from '@/lib/client-api'
import { CONTROL_TYPES, CONTROL_TYPE_LABELS } from '@/lib/recall/types'
import type { ControlType, StripDefinition } from '@/lib/recall/types'

interface DraftControl {
  // Keys of controls that already exist never change, so recorded values keep
  // pointing at the right control. New controls get a key from their label.
  key: string | null
  label: string
  type: ControlType
  unit: string
  min: string
  max: string
  options: string
}

interface DraftSection {
  label: string
  controls: DraftControl[]
}

function toDraft(strip: StripDefinition): DraftSection[] {
  return strip.sections.map((s) => ({
    label: s.label,
    controls: s.controls.map((c) => ({
      key: c.key,
      label: c.label,
      type: c.type,
      unit: c.unit ?? '',
      min: c.min === undefined ? '' : String(c.min),
      max: c.max === undefined ? '' : String(c.max),
      options: (c.options ?? []).join(', ')
    }))
  }))
}

const slug = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 'c$1')
    .slice(0, 36) || 'control'

// Builds the payload, giving every new control a unique key.
function toStrip(sections: DraftSection[]): StripDefinition {
  const used = new Set(
    sections.flatMap((s) => s.controls.map((c) => c.key).filter(Boolean))
  )
  return {
    sections: sections.map((s) => ({
      label: s.label.trim(),
      controls: s.controls.map((c) => {
        let key = c.key
        if (!key) {
          const base = slug(c.label)
          key = base
          for (let n = 2; used.has(key); n += 1) key = `${base}_${n}`
          used.add(key)
        }
        const number = (value: string) =>
          value.trim() === '' || Number.isNaN(Number(value))
            ? undefined
            : Number(value)
        return {
          key,
          label: c.label.trim(),
          type: c.type,
          ...(c.unit.trim() && { unit: c.unit.trim() }),
          ...(c.type === 'knob' && {
            min: number(c.min),
            max: number(c.max)
          }),
          ...(c.type === 'select' && {
            options: c.options
              .split(',')
              .map((o) => o.trim())
              .filter(Boolean)
          })
        }
      })
    }))
  }
}

// Defines a channel strip: sections of controls (knobs, switches, selectors,
// text). Recording a value for a control happens on the recall sheet.
export function TemplateEditor({
  templateId,
  initial,
  canEdit
}: {
  readonly templateId: string | null
  readonly initial: {
    name: string
    description: string | null
    strip: StripDefinition
  }
  readonly canEdit: boolean
}) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description ?? '')
  const [sections, setSections] = useState<DraftSection[]>(
    initial.strip.sections.length
      ? toDraft(initial.strip)
      : [{ label: 'Input', controls: [] }]
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setControl = (si: number, ci: number, patch: Partial<DraftControl>) =>
    setSections((all) =>
      all.map((s, i) =>
        i !== si
          ? s
          : {
              ...s,
              controls: s.controls.map((c, j) =>
                j === ci ? { ...c, ...patch } : c
              )
            }
      )
    )

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const body = {
        name,
        description,
        strip: toStrip(sections)
      }
      if (templateId) {
        await apiFetch(`/api/console-templates/${templateId}`, {
          method: 'PATCH',
          body
        })
        toast({ title: 'Template saved' })
        router.refresh()
      } else {
        await apiFetch('/api/console-templates', { method: 'POST', body })
        toast({ title: 'Template created' })
        router.push('/consoles')
        router.refresh()
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className='space-y-4'>
      <Card>
        <CardContent className='grid gap-3 pt-6 sm:grid-cols-2'>
          <div className='space-y-1'>
            <Label htmlFor='template-name'>Name</Label>
            <Input
              id='template-name'
              value={name}
              maxLength={80}
              disabled={!canEdit}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='template-description'>Description</Label>
            <Input
              id='template-description'
              value={description}
              maxLength={300}
              disabled={!canEdit}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {sections.map((section, si) => (
        <Card key={si}>
          <CardHeader className='flex flex-row items-center gap-2 space-y-0'>
            <CardTitle className='sr-only'>Section {si + 1}</CardTitle>
            <Input
              aria-label={`Section ${si + 1} name`}
              className='max-w-xs font-medium'
              value={section.label}
              maxLength={40}
              disabled={!canEdit}
              onChange={(e) =>
                setSections((all) =>
                  all.map((s, i) =>
                    i === si ? { ...s, label: e.target.value } : s
                  )
                )
              }
            />
            {canEdit && (
              <Button
                variant='ghost'
                size='icon'
                aria-label={`Remove section ${section.label || si + 1}`}
                onClick={() =>
                  setSections((all) => all.filter((_, i) => i !== si))
                }
              >
                <Trash2 />
              </Button>
            )}
          </CardHeader>
          <CardContent className='space-y-2'>
            {section.controls.map((control, ci) => (
              <div
                key={ci}
                className='grid items-end gap-2 sm:grid-cols-[1.4fr_1.4fr_0.7fr_0.6fr_0.6fr_auto]'
              >
                <div className='space-y-1'>
                  <Label className='text-xs'>Label</Label>
                  <Input
                    aria-label={`Control ${ci + 1} label in ${section.label}`}
                    value={control.label}
                    maxLength={40}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setControl(si, ci, { label: e.target.value })
                    }
                  />
                </div>
                <div className='space-y-1'>
                  <Label className='text-xs'>Type</Label>
                  <NativeSelect
                    aria-label={`Control ${ci + 1} type in ${section.label}`}
                    value={control.type}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setControl(si, ci, {
                        type: e.target.value as ControlType
                      })
                    }
                  >
                    {CONTROL_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {CONTROL_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                {control.type === 'select' ? (
                  <div className='space-y-1 sm:col-span-3'>
                    <Label className='text-xs'>Options, comma separated</Label>
                    <Input
                      aria-label={`Control ${ci + 1} options in ${section.label}`}
                      value={control.options}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setControl(si, ci, { options: e.target.value })
                      }
                    />
                  </div>
                ) : (
                  <>
                    <div className='space-y-1'>
                      <Label className='text-xs'>Unit</Label>
                      <Input
                        aria-label={`Control ${ci + 1} unit in ${section.label}`}
                        value={control.unit}
                        maxLength={10}
                        disabled={!canEdit || control.type === 'switch'}
                        onChange={(e) =>
                          setControl(si, ci, { unit: e.target.value })
                        }
                      />
                    </div>
                    <div className='space-y-1'>
                      <Label className='text-xs'>Min</Label>
                      <Input
                        aria-label={`Control ${ci + 1} minimum in ${section.label}`}
                        inputMode='decimal'
                        value={control.min}
                        disabled={!canEdit || control.type !== 'knob'}
                        onChange={(e) =>
                          setControl(si, ci, { min: e.target.value })
                        }
                      />
                    </div>
                    <div className='space-y-1'>
                      <Label className='text-xs'>Max</Label>
                      <Input
                        aria-label={`Control ${ci + 1} maximum in ${section.label}`}
                        inputMode='decimal'
                        value={control.max}
                        disabled={!canEdit || control.type !== 'knob'}
                        onChange={(e) =>
                          setControl(si, ci, { max: e.target.value })
                        }
                      />
                    </div>
                  </>
                )}
                {canEdit && (
                  <Button
                    variant='ghost'
                    size='icon'
                    aria-label={`Remove ${control.label || 'control'}`}
                    onClick={() =>
                      setSections((all) =>
                        all.map((s, i) =>
                          i === si
                            ? {
                                ...s,
                                controls: s.controls.filter((_, j) => j !== ci)
                              }
                            : s
                        )
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            ))}
            {canEdit && (
              <Button
                variant='surface'
                size='sm'
                onClick={() =>
                  setSections((all) =>
                    all.map((s, i) =>
                      i === si
                        ? {
                            ...s,
                            controls: [
                              ...s.controls,
                              {
                                key: null,
                                label: '',
                                type: 'knob',
                                unit: '',
                                min: '',
                                max: '',
                                options: ''
                              }
                            ]
                          }
                        : s
                    )
                  )
                }
              >
                <Plus /> Add control
              </Button>
            )}
          </CardContent>
        </Card>
      ))}

      <FormError message={error} />
      {canEdit && (
        <div className='flex flex-wrap gap-2'>
          <Button
            variant='surface'
            onClick={() =>
              setSections((all) => [...all, { label: '', controls: [] }])
            }
          >
            <Plus /> Add section
          </Button>
          <Button disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save template'}
          </Button>
        </div>
      )}
    </div>
  )
}
