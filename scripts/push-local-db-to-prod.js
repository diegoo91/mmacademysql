#!/usr/bin/env node
/**
 * Push local academy.db.json to Railway production.
 *
 * Required env vars (never hardcode):
 *   PROD_API_BASE   — e.g. https://mmacademy-production.up.railway.app/api
 *   ADMIN_EMAIL     — admin login email
 *   ADMIN_PASSWORD  — admin login password
 *   IMPORT_SECRET   — must match IMPORT_SECRET on Railway
 *
 * Usage:
 *   node scripts/push-local-db-to-prod.js
 */

import { readFileSync } from 'fs'
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

const DB_PATH = join(__dirname, '..', 'server', 'academy.db.json')

async function main() {
  // 1. Read local database
  let database
  try {
    database = JSON.parse(readFileSync(DB_PATH, 'utf-8'))
  } catch (err) {
    console.error(`Failed to read ${DB_PATH}:`, err.message)
    process.exit(1)
  }

  const rows = {}
  for (const [k, v] of Object.entries(database)) {
    rows[k] = Array.isArray(v) ? v.length : 0
  }
  console.log('Local database loaded:')
  console.log(rows)

  // 2. Login as admin
  console.log(`\nLogging in as ${ADMIN_EMAIL}...`)
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

  // 3. Push database
  console.log('\nPushing database to production...')
  const pushRes = await fetch(`${PROD_API_BASE}/admin/import-db`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ secret: IMPORT_SECRET, database }),
  })
  const result = await pushRes.json().catch(() => ({}))
  if (!pushRes.ok) {
    console.error('Push failed:', pushRes.status, result.error || pushRes.statusText)
    process.exit(1)
  }

  console.log('\nSuccess! Production database replaced:')
  console.log(result.counts)
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
