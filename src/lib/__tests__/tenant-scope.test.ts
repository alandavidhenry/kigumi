import { describe, expect, it } from 'vitest'

import { AppError } from '@/lib/errors'
import { TENANT_MODELS, scopeArgs } from '@/lib/tenant-scope'

const ORG = 'org_a'
const OTHER = 'org_b'

function expectCrossTenant(fn: () => unknown) {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe('CROSS_TENANT')
    expect((error as AppError).status).toBe(404)
    return
  }
  throw new Error('Expected CROSS_TENANT to be thrown')
}

describe('TENANT_MODELS', () => {
  it('lists every tenant-owned model', () => {
    expect([...TENANT_MODELS].sort()).toEqual([
      'Attachment',
      'AuditLog',
      'EquipmentItem',
      'MicrophoneUnit',
      'Room',
      'Studio'
    ])
  })
})

describe('scopeArgs', () => {
  it('passes non-tenant models through untouched', () => {
    const args = { where: { id: 'u1' } }
    expect(scopeArgs('User', 'findMany', args, ORG)).toBe(args)
    expect(scopeArgs('Member', 'deleteMany', args, ORG)).toBe(args)
    expect(scopeArgs(undefined, 'findMany', args, ORG)).toBe(args)
  })

  it.each([
    'findUnique',
    'findUniqueOrThrow',
    'findFirst',
    'findFirstOrThrow',
    'findMany',
    'count',
    'aggregate',
    'groupBy',
    'update',
    'updateMany',
    'updateManyAndReturn',
    'delete',
    'deleteMany'
  ])('merges organisationId into where for %s', (operation) => {
    const scoped = scopeArgs('Studio', operation, { where: { id: 's1' } }, ORG)
    expect(scoped?.where).toEqual({ id: 's1', organisationId: ORG })
  })

  it('adds a where clause when none was given', () => {
    expect(scopeArgs('Room', 'findMany', undefined, ORG)).toEqual({
      where: { organisationId: ORG }
    })
    expect(scopeArgs('Room', 'count', {}, ORG)).toEqual({
      where: { organisationId: ORG }
    })
  })

  it('keeps other query options', () => {
    const scoped = scopeArgs(
      'Studio',
      'findMany',
      { orderBy: { name: 'asc' }, take: 5 },
      ORG
    )
    expect(scoped).toEqual({
      orderBy: { name: 'asc' },
      take: 5,
      where: { organisationId: ORG }
    })
  })

  it('does not mutate the original args', () => {
    const args = { where: { id: 's1' } }
    scopeArgs('Studio', 'findFirst', args, ORG)
    expect(args).toEqual({ where: { id: 's1' } })
  })

  it('allows an explicit filter for the same organisation', () => {
    const scoped = scopeArgs(
      'Studio',
      'findMany',
      { where: { organisationId: ORG } },
      ORG
    )
    expect(scoped?.where).toEqual({ organisationId: ORG })
  })

  it('rejects a filter naming another organisation', () => {
    expectCrossTenant(() =>
      scopeArgs('Studio', 'findMany', { where: { organisationId: OTHER } }, ORG)
    )
  })

  it('rejects operator filters on organisationId', () => {
    expectCrossTenant(() =>
      scopeArgs(
        'Studio',
        'findMany',
        { where: { organisationId: { in: [ORG, OTHER] } } },
        ORG
      )
    )
  })

  it('sets organisationId on create data', () => {
    const scoped = scopeArgs('Room', 'create', { data: { name: 'Live' } }, ORG)
    expect(scoped?.data).toEqual({ name: 'Live', organisationId: ORG })
  })

  it('sets organisationId on every createMany row', () => {
    const scoped = scopeArgs(
      'Room',
      'createMany',
      { data: [{ name: 'A' }, { name: 'B', organisationId: ORG }] },
      ORG
    )
    expect(scoped?.data).toEqual([
      { name: 'A', organisationId: ORG },
      { name: 'B', organisationId: ORG }
    ])
  })

  it('sets organisationId on a single createManyAndReturn row', () => {
    const scoped = scopeArgs(
      'Room',
      'createManyAndReturn',
      { data: { name: 'A' } },
      ORG
    )
    expect(scoped?.data).toEqual({ name: 'A', organisationId: ORG })
  })

  it('rejects creating a row in another organisation', () => {
    expectCrossTenant(() =>
      scopeArgs('Room', 'create', { data: { organisationId: OTHER } }, ORG)
    )
    expectCrossTenant(() =>
      scopeArgs(
        'Room',
        'createMany',
        { data: [{ organisationId: ORG }, { organisationId: OTHER }] },
        ORG
      )
    )
  })

  it('rejects relation-style organisation connects', () => {
    expectCrossTenant(() =>
      scopeArgs(
        'Studio',
        'create',
        { data: { name: 'X', organisation: { connect: { id: OTHER } } } },
        ORG
      )
    )
    expectCrossTenant(() =>
      scopeArgs(
        'Studio',
        'update',
        {
          where: { id: 's1' },
          data: { organisation: { connect: { id: OTHER } } }
        },
        ORG
      )
    )
  })

  it('rejects moving a row to another organisation on update', () => {
    expectCrossTenant(() =>
      scopeArgs(
        'Studio',
        'updateMany',
        { where: { id: 's1' }, data: { organisationId: OTHER } },
        ORG
      )
    )
  })

  it('allows updates that leave organisationId alone', () => {
    const scoped = scopeArgs(
      'Studio',
      'update',
      { where: { id: 's1' }, data: { name: 'New' } },
      ORG
    )
    expect(scoped).toEqual({
      where: { id: 's1', organisationId: ORG },
      data: { name: 'New' }
    })
  })

  it('scopes upsert where, create and update', () => {
    const scoped = scopeArgs(
      'Studio',
      'upsert',
      { where: { id: 's1' }, create: { name: 'A' }, update: { name: 'B' } },
      ORG
    )
    expect(scoped).toEqual({
      where: { id: 's1', organisationId: ORG },
      create: { name: 'A', organisationId: ORG },
      update: { name: 'B' }
    })
  })

  it('rejects upserts that create or move into another organisation', () => {
    expectCrossTenant(() =>
      scopeArgs(
        'Studio',
        'upsert',
        { where: { id: 's1' }, create: { organisationId: OTHER }, update: {} },
        ORG
      )
    )
    expectCrossTenant(() =>
      scopeArgs(
        'Studio',
        'upsert',
        { where: { id: 's1' }, create: {}, update: { organisationId: OTHER } },
        ORG
      )
    )
  })

  it('fails closed without an organisation', () => {
    expectCrossTenant(() => scopeArgs('Studio', 'findMany', {}, ''))
  })
})
