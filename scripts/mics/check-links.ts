// Checks that spec-sheet URLs in the catalogue still resolve (ADR 0008,
// decision 3). HEAD requests only, robots.txt and Crawl-delay respected.
//
//   npm run mics:check-links
import { PrismaPg } from '@prisma/adapter-pg'
import { config } from 'dotenv'

import { PrismaClient } from '../../src/generated/prisma/client'
import { checkLinks } from '../../src/lib/mics/link-check'

config({ path: '.env.local', override: true })
config()

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  })
  try {
    const mics = await prisma.microphoneModel.findMany({
      where: { specSheetUrl: { not: null } },
      select: { manufacturer: true, model: true, specSheetUrl: true }
    })
    const urls = mics.map((mic) => mic.specSheetUrl!)
    const names = new Map(
      mics.map((mic) => [mic.specSheetUrl!, `${mic.manufacturer} ${mic.model}`])
    )
    const results = await checkLinks(urls)
    let broken = 0
    for (const result of results) {
      const label = names.get(result.url) ?? result.url
      if (result.state === 'ok') {
        console.warn(`ok       ${label}`)
      } else {
        if (result.state === 'broken') broken++
        console.warn(`${result.state.padEnd(8)} ${label}: ${result.detail}`)
      }
    }
    console.warn(`${results.length} checked, ${broken} broken`)
    if (broken > 0) process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
