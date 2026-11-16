import { SlidersHorizontal } from 'lucide-react'
import Link from 'next/link'

import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import {
  AddConsoleButton,
  ConsoleRowActions
} from '@/components/recall/console-manager'
import { TemplateRowActions } from '@/components/recall/template-row-actions'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  listBuiltInTemplates,
  listConsoleTemplates,
  listConsoles
} from '@/lib/recall/consoles'
import { getTenantContext } from '@/lib/tenant-context'
import { Permission, hasPermission } from '@/types/rbac'

export const metadata = { title: 'Consoles & recall' }

export default async function ConsolesPage() {
  const ctx = await getTenantContext()
  const [consoles, templates] = await Promise.all([
    listConsoles(ctx),
    listConsoleTemplates(ctx)
  ])
  const builtIn = listBuiltInTemplates()
  const canEdit = hasPermission(ctx.role, Permission.MANAGE_SESSIONS)
  const templateChoices = templates.map((t) => ({ id: t.id, name: t.name }))

  return (
    <div className='space-y-8'>
      <PageHeader
        title='Consoles & recall'
        description='Describe your desk once, then record its settings per session from the session page. Free on every plan.'
        actions={
          canEdit ? (
            <AddConsoleButton builtIn={builtIn} templates={templateChoices} />
          ) : undefined
        }
      />

      <section className='space-y-3'>
        <h2 className='text-base font-semibold'>Your consoles</h2>
        {consoles.length === 0 ? (
          <Card>
            <EmptyState
              icon={SlidersHorizontal}
              title='No consoles yet'
              description='Add your desk and choose a channel-strip template. The shipped generic analogue desk is a good starting point.'
            />
          </Card>
        ) : (
          <Card className='divide-y overflow-hidden p-0'>
            {consoles.map((c) => (
              <div
                key={c.id}
                className='flex items-center justify-between gap-3 px-4 py-3'
              >
                <div className='min-w-0'>
                  <p className='font-medium'>{c.name}</p>
                  <p className='text-xs text-muted-foreground'>
                    {[c.make, c.model].filter(Boolean).join(' ')}
                    {c.make || c.model ? ' · ' : ''}
                    {c.channelCount} channels · strip: {c.templateName}
                  </p>
                </div>
                <ConsoleRowActions
                  console={c}
                  builtIn={builtIn}
                  templates={templateChoices}
                  canEdit={canEdit}
                />
              </div>
            ))}
          </Card>
        )}
      </section>

      <section className='space-y-3'>
        <div className='flex items-center justify-between'>
          <h2 className='text-base font-semibold'>Channel-strip templates</h2>
          {canEdit && (
            <Button asChild variant='surface' size='sm'>
              <Link href='/consoles/templates/new'>New template</Link>
            </Button>
          )}
        </div>
        <Card className='divide-y overflow-hidden p-0'>
          {builtIn.map((t) => (
            <div key={t.id} className='px-4 py-3'>
              <p className='font-medium'>{t.name} (shipped)</p>
              <p className='text-xs text-muted-foreground'>
                {t.description} Adding a console with it gives you your own
                editable copy.
              </p>
            </div>
          ))}
          {templates.map((t) => (
            <div
              key={t.id}
              className='flex items-center justify-between gap-3 px-4 py-3'
            >
              <div className='min-w-0'>
                <Link
                  href={`/consoles/templates/${t.id}`}
                  className='font-medium hover:underline'
                >
                  {t.name}
                </Link>
                <p className='text-xs text-muted-foreground'>
                  {t.controlCount} controls · used by {t.consoleCount} console
                  {t.consoleCount === 1 ? '' : 's'}
                </p>
              </div>
              <TemplateRowActions
                id={t.id}
                name={t.name}
                inUse={t.consoleCount > 0}
                canEdit={canEdit}
              />
            </div>
          ))}
        </Card>
      </section>
    </div>
  )
}
