'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/use-toast'
import { apiFetch } from '@/lib/client-api'
import type { TemplateSummary } from '@/lib/layout/service'

export function TemplateRow({
  template,
  canManage
}: {
  readonly template: TemplateSummary
  readonly canManage: boolean
}) {
  const router = useRouter()
  const [name, setName] = useState(template.name)

  return (
    <div className='flex min-h-14 flex-wrap items-center gap-3 px-4 py-3'>
      <div className='min-w-0 flex-1'>
        {canManage ? (
          <Input
            aria-label='Template name'
            className='h-8 max-w-xs'
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onBlur={async () => {
              const next = name.trim()
              if (!next || next === template.name) return
              try {
                await apiFetch(`/api/layouts/templates/${template.id}`, {
                  method: 'PATCH',
                  body: { name: next }
                })
                router.refresh()
              } catch (caught) {
                toast({
                  title:
                    caught instanceof Error
                      ? caught.message
                      : 'Could not rename',
                  variant: 'destructive'
                })
              }
            }}
          />
        ) : (
          <p className='font-medium'>{template.name}</p>
        )}
        <p className='mt-1 text-xs text-muted-foreground'>
          {(template.widthMm / 1000).toFixed(1)} m ×{' '}
          {(template.lengthMm / 1000).toFixed(1)} m · {template.itemCount} items
          {template.roomName && ` · from ${template.roomName}`}
        </p>
      </div>
      <Button asChild variant='outline' size='sm'>
        <Link href={`/layouts/templates/${template.id}`}>
          {canManage ? 'Edit layout' : 'View'}
        </Link>
      </Button>
      {canManage && (
        <ConfirmDeleteButton
          title='Delete this template?'
          description='Sessions already made from it are not affected.'
          label='Delete'
          onConfirm={async () => {
            await apiFetch(`/api/layouts/templates/${template.id}`, {
              method: 'DELETE'
            })
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
