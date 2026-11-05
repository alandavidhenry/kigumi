import fs from 'node:fs'
import path from 'node:path'

import { Client } from 'pg'

import { TEST_DATABASE_URL, assertTestDatabase } from './config'

// Recreates the test database and applies every migration's SQL in order, so
// the suite always runs against exactly the schema the migrations produce.
// (The Prisma CLI is not used here: prisma.config.ts always loads .env.local,
// which points at the development database.)
export default async function setup() {
  const name = assertTestDatabase(TEST_DATABASE_URL)
  const adminUrl = new URL(TEST_DATABASE_URL)
  adminUrl.pathname = '/postgres'

  const admin = new Client({ connectionString: adminUrl.toString() })
  await admin.connect()
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${name}"`)
  await admin.end()

  const db = new Client({ connectionString: TEST_DATABASE_URL })
  await db.connect()
  const dir = path.resolve('prisma/migrations')
  const migrations = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  for (const migration of migrations) {
    await db.query(
      fs.readFileSync(path.join(dir, migration, 'migration.sql'), 'utf8')
    )
  }
  await db.end()
}
