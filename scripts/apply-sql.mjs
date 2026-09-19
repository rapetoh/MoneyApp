#!/usr/bin/env node
// Apply one SQL file to the Murmur production database.
//
// Usage: node scripts/apply-sql.mjs supabase/migrations/033_app_events_and_first_run_funnel.sql
//
// Why this exists: `supabase db push` must never run against this project
// (the remote history uses timestamp versions from the SQL-editor era and a
// push would re-run old migrations). The documented path is a direct
// connection through the session pooler, with SUPABASE_DB_PASSWORD from the
// git-ignored root .env. Migrations here are written to be re-runnable
// (IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS), and each file wraps
// itself in BEGIN/COMMIT, so a failure changes nothing.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const file = process.argv[2]
if (!file || !file.endsWith('.sql')) {
  console.error('Usage: node scripts/apply-sql.mjs <path/to/file.sql>')
  process.exit(1)
}

const env = readFileSync(resolve(root, '.env'), 'utf8')
const match = env.match(/^SUPABASE_DB_PASSWORD=(.*)$/m)
if (!match) {
  console.error('SUPABASE_DB_PASSWORD is missing from the root .env')
  process.exit(1)
}
const password = match[1].trim().replace(/^["']|["']$/g, '')
const sql = readFileSync(resolve(root, file), 'utf8')

const client = new pg.Client({
  host: 'aws-1-us-east-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.ohaqhwampmyoeaopdybd',
  password,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

try {
  await client.connect()
  await client.query(sql)
  console.log(`Applied ${file}`)
} catch (e) {
  console.error(`Failed: ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end()
}
