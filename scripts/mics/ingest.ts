// Loads the versioned mic seed files (data/mics/*.json) as DRAFT rows for the
// admin review queue (ADR 0008). Never publishes, and never overwrites a
// published record.
//
//   npm run mics:ingest              validate and load
//   npm run mics:ingest -- --dry-run validate and report only
import fs from 'node:fs'
import path from 'node:path'

import { PrismaPg } from '@prisma/adapter-pg'
import { config } from 'dotenv'

import { PrismaClient } from '../../src/generated/prisma/client'
import {
  ingestEntries,
  makersFileSchema,
  seedFileSchema,
  validateSeedSet
} from '../../src/lib/mics/seed'

config({ path: '.env.local', override: true })
config()

const dataDir = path.resolve('data/mics')
const dryRun = process.argv.includes('--dry-run')

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'))
}

async function main() {
  const files = fs
    .readdirSync(dataDir)
    .filter((name) => name.endsWith('.json') && name !== 'makers.json')
    .sort()
  const seeds = files.map((name) => {
    const parsed = seedFileSchema.safeParse(readJson(name))
    if (!parsed.success) {
      console.error(`${name}: invalid`)
      for (const issue of parsed.error.issues) {
        console.error(`  ${issue.path.join('.')}: ${issue.message}`)
      }
      process.exit(1)
    }
    return parsed.data
  })
  const makers = makersFileSchema.parse(readJson('makers.json'))

  const report = validateSeedSet(seeds, makers)
  console.warn(
    `${report.total} entries from ${files.length} files. Counted towards each maker's cap:`,
    report.countsByMaker
  )
  for (const warning of report.warnings) console.warn(`warning: ${warning}`)
  for (const error of report.errors) console.error(`error: ${error}`)
  if (report.errors.length > 0) process.exit(1)

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  })
  try {
    const result = await prisma.$transaction(
      (tx) =>
        ingestEntries(
          tx,
          seeds.flatMap((seed) => seed.entries),
          { dryRun }
        ),
      { timeout: 120_000 }
    )
    console.warn(
      `${dryRun ? '[dry run] ' : ''}created ${result.created.length}, updated ${result.updated.length}, skipped ${result.skippedPublished.length} published`
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
