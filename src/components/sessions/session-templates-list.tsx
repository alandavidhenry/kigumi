'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ConfirmDeleteButton } from '@/components/confirm-delete-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/use-toast'
import { apiFetch } from '@/lib/client-api'
import type { SessionTemplateSummary } from '@/lib/sessions/templates'

function Row({
  template,
  canManage
}: {
  readonly template: SessionTemplateSummary
  readonly canManage: boolean
}) {
  const router = useRouter()
  const [name, setName] = useState(template.name)
  const count = template.sources.length

  return (
    <div className='flex min-h-14 flex-wrap items-center gap-3 px-4 py-3'>
      <div className='min-w-0 flex-1'>
        {canManage ? (
          <Input
            aria-label='Session template name'
            className='h-8 max-w-xs'
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onBlur={async () => {
              const next = name.trim()
              if (!next || next === template.name) return
              try {
                await apiFetch(`/api/session-templates/${template.id}`, {
                  method: 'PATCH',
                  body: { name: next, description: template.description }
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
        {template.description && (
          <p className='mt-1 text-xs text-muted-foreground'>
            {template.description}
          </p>
        )}
        <p className='mt-1 text-xs text-muted-foreground'>
          {count} {count === 1 ? 'source' : 'sources'}
          {template.consoleName && ` · ${template.consoleName}`}
        </p>
      </div>
      {canManage && (
        <Button asChild size='sm' variant='surface'>
          <Link href={`/sessions/new?template=${template.id}`}>Use</Link>
        </Button>
      )}
      {canManage && (
        <ConfirmDeleteButton
          title='Delete this session template?'
          description='Sessions already made from it are not affected.'
          label='Delete'
          onConfirm={async () => {
            await apiFetch(`/api/session-templates/${template.id}`, {
              method: 'DELETE'
            })
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

export function SessionTemplatesList({
  templates,
  canManage
}: {
  readonly templates: SessionTemplateSummary[]
  readonly canManage: boolean
}) {
  return (
    <>
      {templates.map((template) => (
        <Row key={template.id} template={template} canManage={canManage} />
      ))}
    </>
  )
}
