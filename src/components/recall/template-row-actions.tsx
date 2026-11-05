'use client'

import { useRouter } from 'next/navigation'

import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
import { toast } from '@/components/ui/use-toast'
import { apiFetch } from '@/lib/client-api'

export function TemplateRowActions({
  id,
  name,
  inUse,
  canEdit
}: {
  readonly id: string
  readonly name: string
  readonly inUse: boolean
  readonly canEdit: boolean
}) {
  const router = useRouter()
  if (!canEdit) return null
  return (
    <ConfirmDeleteButton
      title={`Delete ${name}?`}
      description={
        inUse
          ? 'A console still uses this template, so it cannot be deleted. Point the console at another template first.'
          : 'Recall sheets already written keep their own copy of the strip.'
      }
      label={`Delete ${name}`}
      size='icon'
      onConfirm={async () => {
        await apiFetch(`/api/console-templates/${id}`, { method: 'DELETE' })
        toast({ title: 'Template deleted' })
        router.refresh()
      }}
    />
  )
}
