import fs from 'node:fs'

const loadEnv = (file) => {
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const env = loadEnv(new URL('./.env', import.meta.url))
const login = await (await fetch('http://127.0.0.1:5174/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: env.ADMIN_EMAIL || 'admin@mmpadel.com', password: env.ADMIN_PASSWORD }),
})).json()
const rep = await (await fetch('http://127.0.0.1:5174/api/reports/unpaid', {
  headers: { Authorization: `Bearer ${login.accessToken}` },
})).json()
const orig = JSON.parse(fs.readFileSync(new URL('./data/unpaid-recommendations.json', import.meta.url), 'utf8'))
const om = new Map(orig.map(r => [r.id, r.amount_owed]))
let bad = 0
for (const p of rep.unpaid_players) {
  if (om.get(p.id) !== p.amount_owed) {
    bad++
    console.log('MISMATCH', p.name, p.amount_owed, 'expected', om.get(p.id))
  }
}
for (const r of orig) {
  if (!rep.unpaid_players.some(p => p.id === r.id)) { bad++; console.log('MISSING player', r.name) }
}
console.log(`players: ${rep.unpaid_players.length} / ${orig.length}  per-player mismatches: ${bad}  total: EGP ${rep.total_owed}`)
process.exit(bad ? 1 : 0)
