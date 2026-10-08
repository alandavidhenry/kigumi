// Seeds a demo organisation for local development and E2E tests.
// Usage: npm run db:seed -- <password>   (defaults to SEED_PASSWORD or a dev password)
//
// Creates verified users for every role so each permission path can be
// exercised: owner@, manager@, engineer@ and viewer@kigumi.test.
import { PrismaPg } from '@prisma/adapter-pg'
import { hashPassword } from 'better-auth/crypto'
import { config } from 'dotenv'

import { PrismaClient } from '../src/generated/prisma/client'

config({ path: '.env.local', override: true })
config()

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! })
})

const ORG_ID = 'seed-org-northern-lights'
const ROLES = ['owner', 'manager', 'engineer', 'viewer'] as const

async function upsertUser(role: (typeof ROLES)[number], passwordHash: string) {
  const email = `${role}@kigumi.test`
  const id = `seed-user-${role}`
  const name = `${role[0].toUpperCase()}${role.slice(1)} Demo`

  await prisma.user.upsert({
    where: { email },
    update: { name, emailVerified: true },
    create: { id, email, name, emailVerified: true }
  })
  await prisma.account.upsert({
    where: { id: `seed-account-${role}` },
    update: { password: passwordHash },
    create: {
      id: `seed-account-${role}`,
      accountId: id,
      providerId: 'credential',
      userId: id,
      password: passwordHash
    }
  })
  await prisma.member.upsert({
    where: { id: `seed-member-${role}` },
    update: { role },
    create: {
      id: `seed-member-${role}`,
      organizationId: ORG_ID,
      userId: id,
      role
    }
  })
}

async function main() {
  const password =
    process.argv[2] ?? process.env.SEED_PASSWORD ?? 'kigumi-dev-password'
  const passwordHash = await hashPassword(password)

  await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: {},
    create: {
      id: ORG_ID,
      name: 'Northern Lights Recording',
      slug: 'northern-lights-recording',
      planTier: 'studio'
    }
  })

  for (const role of ROLES) await upsertUser(role, passwordHash)

  const studio = await prisma.studio.upsert({
    where: { id: 'seed-studio-main' },
    update: {},
    create: {
      id: 'seed-studio-main',
      organisationId: ORG_ID,
      name: 'Main studio',
      address: '1 Harbour Street, Leith',
      timezone: 'Europe/London'
    }
  })

  const rooms = [
    {
      id: 'seed-room-live',
      name: 'Live room',
      widthMm: 7200,
      lengthMm: 9400,
      heightMm: 4200
    },
    {
      id: 'seed-room-control',
      name: 'Control room',
      widthMm: 5200,
      lengthMm: 6100,
      heightMm: 3000
    },
    {
      id: 'seed-room-booth',
      name: 'Vocal booth',
      widthMm: 2100,
      lengthMm: 2400,
      heightMm: 2700
    }
  ]
  for (const room of rooms) {
    await prisma.room.upsert({
      where: { id: room.id },
      update: {},
      create: { ...room, organisationId: ORG_ID, studioId: studio.id }
    })
  }

  console.warn(
    `Seeded ${ROLES.map((role) => `${role}@kigumi.test`).join(', ')} with the given password`
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
