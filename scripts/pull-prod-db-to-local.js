#!/usr/bin/env node
/**
 * Pull production database from Railway to local.
 *
 * Required env vars (never hardcode):
 *   PROD_API_BASE   — e.g. https://mmacademy-production.up.railway.app/api
 *   ADMIN_EMAIL     — admin login email
 *   ADMIN_PASSWORD  — admin login password
 *   IMPORT_SECRET   — must match IMPORT_SECRET on Railway
 *
 * Usage:
 *   node scripts/pull-prod-db-to-local.js
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PROD_API_BASE = process.env.PROD_API_BASE
const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
const IMPORT_SECRET = process.env.IMPORT_SECRET

function missing(name) {
  console.error(`Missing required env var: ${name}`)
  process.exit(1)
}

if (!PROD_API_BASE) missing('PROD_API_BASE')
if (!ADMIN_EMAIL) missing('ADMIN_EMAIL')
if (!ADMIN_PASSWORD) missing('ADMIN_PASSWORD')
if (!IMPORT_SECRET) missing('IMPORT_SECRET')

const DB_PATH = join(__dirname, '..', 'server', 'data', 'academy.db.json')
const BACKUP_DIR = join(__dirname, '..', 'server', 'data', 'backups')

async function main() {
  // 1. Login as admin
  console.log(`Logging in as ${ADMIN_EMAIL}...`)
  const loginRes = await fetch(`${PROD_API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  })
  if (!loginRes.ok) {
    const err = await loginRes.json().catch(() => ({}))
    console.error('Login failed:', loginRes.status, err.error || loginRes.statusText)
    process.exit(1)
  }
  const { accessToken } = await loginRes.json()
  console.log('Login OK')

  // 2. Fetch production database
  console.log('\nFetching production database...')
  const exportRes = await fetch(`${PROD_API_BASE}/admin/import-db/export-db?secret=${encodeURIComponent(IMPORT_SECRET)}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  if (!exportRes.ok) {
    const err = await exportRes.json().catch(() => ({}))
    console.error('Export failed:', exportRes.status, err.error || exportRes.statusText)
    process.exit(1)
  }
  const database = await exportRes.json()

  const rows = {}
  for (const [k, v] of Object.entries(database)) {
    rows[k] = Array.isArray(v) ? v.length : 0
  }
  console.log('Production database loaded:')
  console.log(rows)

  // 3. Backup local database
  if (existsSync(DB_PATH)) {
    if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const backupPath = join(BACKUP_DIR, `academy.db.${timestamp}.json`)
    writeFileSync(backupPath, readFileSync(DB_PATH, 'utf-8'))
    console.log(`\nLocal backup saved: ${backupPath}`)
  }

  // 4. Overwrite local database
  writeFileSync(DB_PATH, JSON.stringify(database, null, 2))
  console.log(`\nSuccess! Local database overwritten: ${DB_PATH}`)
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
