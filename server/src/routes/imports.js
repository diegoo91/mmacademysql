import { Router } from 'express'
import multer from 'multer'
import XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import { fileURLToPath } from 'url'
import { dirname, join, extname } from 'path'
import { randomBytes } from 'crypto'
import db from '../database.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Accept only spreadsheet types by extension
function isSpreadsheet(file) {
  const ext = (file.originalname || '').split('.').pop().toLowerCase()
  return ['xlsx', 'xls', 'csv'].includes(ext)
}

const storage = multer.diskStorage({
  destination: join(__dirname, '..', '..', 'data', 'uploads'),
  filename: (req, file, cb) => cb(null, `import_${randomBytes(8).toString('hex')}${extname(file.originalname)}`),
})
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (isSpreadsheet(file)) cb(null, true)
    else cb(new Error('Only .xlsx, .xls, and .csv files are allowed'))
  },
})

const router = Router()
router.use(authenticate)
router.use(requireRole('superadmin', 'admin'))

function generateCourtTime(raw, format) {
  if (!raw) return raw
  const cleaned = raw.trim()
  if (format === 'womens 4s') return `Court 1 – ${cleaned}`
  return cleaned
}

const TEMPLATES = {
  results: {
    filename: 'results.xlsx',
    collection: 'results',
    sheetName: 'Results',
    format: 'wide',
    fields: ['date', 'court_time', 'format', 'side_a', 'side_b', 'score_a', 'score_b'],
    headers: ['Date', 'Court & Time', 'Format', 'Side A (names)', 'Side B (names)', 'Score A', 'Score B'],
    required: ['date', 'format', 'side_a', 'side_b', 'score_a', 'score_b'],
    validationRules: {
      format: { type: 'list', values: ['4s', 'womens 4s'] },
      score_a: { type: 'wholeNumber', min: 0, max: 20 },
      score_b: { type: 'wholeNumber', min: 0, max: 20 },
    },
    transformations: {
      side_a: (v) => v.split('/').map(n => n.trim()).join(' / '),
      side_b: (v) => v.split('/').map(n => n.trim()).join(' / '),
    },
    postProcess(rows) {
      const courtTimeMap = {}
      for (const row of rows) {
        if (!row.court_time || !row.format) continue
        const ct = row.court_time.toLowerCase().trim()
        if (courtTimeMap[ct]) {
          row.court_time = courtTimeMap[ct]
        } else {
          const newCt = generateCourtTime(row.court_time, row.format)
          courtTimeMap[ct] = newCt
          row.court_time = newCt
        }
      }
      return rows
    },
    validate(row) {
      const errors = []
      if (!row.date?.trim()) errors.push('date is required')
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) errors.push('date must be YYYY-MM-DD')
      if (!row.format?.trim()) errors.push('format is required')
      else if (!['4s', 'womens 4s'].includes(row.format)) errors.push('format must be 4s or womens 4s')
      if (!row.side_a?.trim()) errors.push('side_a is required')
      if (!row.side_b?.trim()) errors.push('side_b is required')
      if (row.score_a === undefined || row.score_a === '') errors.push('score_a is required')
      else if (isNaN(parseInt(row.score_a))) errors.push('score_a must be a number')
      if (row.score_b === undefined || row.score_b === '') errors.push('score_b is required')
      else if (isNaN(parseInt(row.score_b))) errors.push('score_b must be a number')
      return errors
    },
    commit(rows, batchId) {
      let count = 0
      for (const r of rows) {
        const sideA = r.side_a.split('/').map(n => n.trim()).filter(Boolean)
        const sideB = r.side_b.split('/').map(n => n.trim()).filter(Boolean)
        const sa = parseInt(r.score_a) || 0
        const sb = parseInt(r.score_b) || 0
        const winnerSide = sa > sb ? 'A' : sb > sa ? 'B' : null

        db.insert('results', {
          date: r.date.trim(),
          format: r.format.trim(),
          side_a: sideA.join(' / '),
          side_b: sideB.join(' / '),
          score_a: sa,
          score_b: sb,
          score_text: `${sa}–${sb}`,
          winner_side: winnerSide,
          winner: winnerSide === 'A' ? sideA.join(' / ') : winnerSide === 'B' ? sideB.join(' / ') : '',
          status: 'confirmed',
          submitted_by: null,
          court_time: r.court_time || '',
          notes: '',
          import_batch: batchId,
        })
        count++
      }
      return count
    },
  },
  schedule: {
    filename: 'schedule.xlsx',
    collection: 'slots',
    sheetName: 'Schedule',
    fields: ['date', 'time', 'court', 'player', 'session_type'],
    headers: ['Date', 'Time (e.g., 10:00-12:00)', 'Court (1-6)', 'Player Full Name', 'Session Type'],
    required: ['date', 'time', 'court', 'player'],
    validationRules: {
      time: { type: 'custom', validate: (v) => /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(v) },
      court: { type: 'list', values: ['1', '2', '3', '4', '5', '6'] },
      session_type: { type: 'list', values: ['private', 'group'] },
    },
    validate(row) {
      const errors = []
      if (!row.date?.trim()) errors.push('date is required')
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) errors.push('date must be YYYY-MM-DD')
      if (!row.time?.trim()) errors.push('time is required')
      else if (!/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(row.time.trim())) errors.push('time must be HH:MM-HH:MM')
      if (!row.court) errors.push('court is required')
      else if (!['1', '2', '3', '4', '5', '6'].includes(String(row.court))) errors.push('court must be 1-6')
      if (!row.player?.trim()) errors.push('player is required')
      if (row.session_type && !['private', 'group'].includes(row.session_type)) errors.push('session_type must be private or group')
      return errors
    },
    commit(rows) {
      let count = 0
      for (const r of rows) {
        db.upsert('slots', ['date', 'time', 'court'], {
          date: r.date.trim(),
          time: r.time.trim(),
          court: parseInt(r.court),
          player_text: r.player || '',
          session_type: r.session_type || 'group',
          booking_id: null,
        })
        count++
      }
      return count
    },
  },
  payments: {
    filename: 'payments.xlsx',
    collection: 'bookings',
    sheetName: 'Payments',
    fields: ['ref', 'amount_paid', 'payment_method', 'payment_date'],
    headers: ['Booking Ref', 'Amount Paid (AED)', 'Payment Method', 'Payment Date'],
    required: ['ref', 'amount_paid'],
    validationRules: {
      payment_method: { type: 'list', values: ['cash', 'card', 'transfer', 'other'] },
      amount_paid: { type: 'decimal', min: 0 },
    },
    validate(row) {
      const errors = []
      if (!row.ref?.trim()) errors.push('ref is required')
      if (row.amount_paid === undefined || row.amount_paid === '') errors.push('amount_paid is required')
      else if (isNaN(parseFloat(row.amount_paid))) errors.push('amount_paid must be a number')
      else if (parseFloat(row.amount_paid) < 0) errors.push('amount_paid must be >= 0')
      if (row.payment_method && !['cash', 'card', 'transfer', 'other'].includes(row.payment_method)) errors.push('payment_method must be cash, card, transfer, or other')
      return errors
    },
    commit(rows) {
      let count = 0
      for (const r of rows) {
        const booking = db.find('users', b => b.ref === r.ref.trim()) || db.find('bookings', b => b.ref === r.ref.trim())
        if (booking) {
          db.update('bookings', booking.id, {
            amount_paid: parseFloat(r.amount_paid) || 0,
            payment_method: r.payment_method || 'other',
            payment_date: r.payment_date || new Date().toISOString().slice(0, 10),
            status: 'confirmed',
          })
          count++
        }
      }
      return count
    },
  },
  bookings: {
    filename: 'bookings.xlsx',
    collection: 'bookings',
    sheetName: 'Bookings',
    format: 'wide',
    fields: ['player_name', 'session_type', 'sessions', 'total', 'status', 'paid', 'amountPaid', 'mode'],
    headers: ['Player Name', 'Session Type', 'Sessions', 'Total (AED)', 'Status', 'Paid (0/1)', 'Amount Paid', 'Mode'],
    required: ['player_name', 'session_type', 'total'],
    validationRules: {
      session_type: { type: 'list', values: ['private', 'group'] },
      status: { type: 'list', values: ['confirmed', 'pending', 'cancelled'] },
      paid: { type: 'list', values: ['0', '1'] },
    },
    transformations: {
      sessions: (v) => v.join(', '),
      mode: () => 'manual',
    },
    validate(row) {
      const errors = []
      if (!row.player_name?.trim()) errors.push('player_name is required')
      if (!row.session_type?.trim()) errors.push('session_type is required')
      else if (!['private', 'group'].includes(row.session_type)) errors.push('session_type must be private or group')
      if (row.total === undefined || row.total === '') errors.push('total is required')
      else if (isNaN(parseFloat(row.total))) errors.push('total must be a number')
      if (row.status && !['confirmed', 'pending', 'cancelled'].includes(row.status)) errors.push('status must be confirmed, pending, or cancelled')
      if (row.paid && !['0', '1'].includes(row.paid)) errors.push('paid must be 0 or 1')
      return errors
    },
    commit(rows, batchId) {
      let count = 0
      for (const r of rows) {
        db.insert('bookings', {
          player_name: r.player_name.trim(),
          session_type: r.session_type.trim(),
          sessions: r.sessions || '',
          total: parseFloat(r.total) || 0,
          status: r.status || 'pending',
          paid: r.paid === '1' ? 1 : 0,
          amount_paid: parseFloat(r.amountPaid) || 0,
          mode: 'manual',
          import_batch: batchId,
        })
        count++
      }
      return count
    },
  },
  players: {
    filename: 'players.xlsx',
    collection: 'users',
    sheetName: 'Players',
    fields: ['full_name', 'email', 'phone', 'dob', 'skill_level'],
    headers: ['Full Name', 'Email', 'Phone', 'Date of Birth', 'Skill Level'],
    required: ['full_name', 'email'],
    validationRules: {
      skill_level: { type: 'list', values: ['Beginner', 'Intermediate', 'Advanced'] },
    },
    validate(row) {
      const errors = []
      if (!row.full_name?.trim()) errors.push('full_name is required')
      if (!row.email?.trim()) errors.push('email is required')
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push('Invalid email format')
      if (row.skill_level && !['Beginner', 'Intermediate', 'Advanced'].includes(row.skill_level)) errors.push(`Invalid skill_level: ${row.skill_level}`)
      if (row.dob && !/^\d{4}-\d{2}-\d{2}$/.test(row.dob)) errors.push('dob must be YYYY-MM-DD')
      return errors
    },
    commit(rows) {
      let count = 0
      for (const r of rows) {
        if (!r.email?.trim()) continue
        const existing = db.find('users', u => u.email.toLowerCase().trim() === r.email.toLowerCase().trim())
        if (existing) continue
        db.insert('users', {
          name: r.full_name.trim(),
          email: r.email.trim().toLowerCase(),
          phone: r.phone || '',
          dob: r.dob || '',
          role: 'player',
          password_hash: null,
          is_claimed: false,
          skill_level: r.skill_level || 'Intermediate',
          notes: '',
          private_balance: 0,
          group_balance: 0,
          member_since: new Date().getFullYear().toString(),
          force_password_change: 1,
        })
        count++
      }
      return count
    },
  },
}

function normalizeHeader(h) {
  return String(h).replace(/\*/g, '').replace(/\(.*?\)/g, '').replace(/_/g, ' ').trim().toLowerCase()
}

function generateSampleRows(tpl) {
  switch (tpl.sheetName) {
    case 'Results':
      return [
        ['2026-01-15', 'Court 1 – 10:00-11:00', '4s', 'Player A / Player B', 'Player C / Player D', '6', '3'],
        ['2026-01-15', 'Court 2 – 11:00-12:00', 'womens 4s', 'Player E / Player F', 'Player G / Player H', '6', '2'],
      ]
    case 'Bookings':
      return [
        ['John Smith', 'group', '2026-01-15 10:00, 2026-01-17 14:00', '250', 'confirmed', '1', '250', 'manual'],
        ['Jane Doe', 'private', '2026-01-16 09:00', '150', 'pending', '0', '0', 'manual'],
      ]
    case 'Schedule':
      return [
        ['2026-01-15', '10:00-12:00', '1', 'John Smith', 'group'],
        ['2026-01-15', '12:00-14:00', '2', 'Jane Doe', 'private'],
      ]
    case 'Payments':
      return [
        ['MM-PDL-12345', '250', 'card', '2026-01-15'],
        ['MM-PDL-12346', '150', 'cash', '2026-01-16'],
      ]
    case 'Players':
      return [
        ['John Smith', 'john@example.com', '+971501234567', '1990-01-15', 'Intermediate'],
        ['Jane Doe', 'jane@example.com', '+971509876543', '1985-06-20', 'Advanced'],
      ]
    default:
      return []
  }
}

async function generateTemplate(key) {
  const tpl = TEMPLATES[key]
  if (!tpl) throw new Error('Invalid template')

  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet(tpl.sheetName || tpl.filename.replace('.xlsx', ''))

  const headerRow = ws.addRow(tpl.headers)
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7490' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FF000000' } },
    }
  })
  headerRow.height = 22

  ws.columns = tpl.headers.map((h) => {
    return { width: Math.max(h.length + 4, 20) }
  })

  if (tpl.validationRules) {
    for (const [field, rule] of Object.entries(tpl.validationRules)) {
      const colIndex = tpl.fields.indexOf(field) + 1
      if (colIndex <= 0) continue

      if (rule.type === 'list') {
        for (let r = 2; r <= 1000; r++) {
          ws.getCell(r, colIndex).dataValidation = {
            type: 'list',
            allowBlank: !tpl.required.includes(field),
            formulae: [`"${rule.values.join(',')}"`],
            showErrorMessage: true,
            errorTitle: 'Invalid value',
            error: `Must be one of: ${rule.values.join(', ')}`,
          }
        }
      }
      if (rule.type === 'wholeNumber' || rule.type === 'decimal') {
        for (let r = 2; r <= 1000; r++) {
          ws.getCell(r, colIndex).dataValidation = {
            type: rule.type === 'wholeNumber' ? 'whole' : 'decimal',
            operator: 'between',
            allowBlank: true,
            formulae: [rule.min, rule.max || 999999],
            showErrorMessage: true,
            errorTitle: 'Invalid number',
            error: `Must be between ${rule.min} and ${rule.max || 999999}`,
          }
        }
      }
    }
  }

  const sampleRows = generateSampleRows(tpl)
  for (const row of sampleRows) {
    ws.addRow(row)
  }

  for (let r = 2; r <= sampleRows.length + 1; r++) {
    for (let c = 1; c <= tpl.headers.length; c++) {
      ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } }
      ws.getCell(r, c).font = { italic: true, color: { argb: 'FF6B7280' } }
    }
  }

  return workbook.xlsx.writeBuffer()
}

router.get('/template/:key', async (req, res) => {
  try {
    const { key } = req.params
    const tpl = TEMPLATES[key]
    if (!tpl) return res.status(400).json({ error: 'Invalid template key. Available: results, schedule, payments, bookings, players' })
    const buffer = await generateTemplate(key)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename=${tpl.filename}`)
    res.send(Buffer.from(buffer))
  } catch (err) {
    console.error('Template download error:', err)
    res.status(500).json({ error: 'Failed to generate template' })
  }
})

router.post('/:kind/preview', upload.single('file'), (req, res) => {
  try {
    const { kind } = req.params
    const tmpl = TEMPLATES[kind]
    if (!tmpl) return res.status(400).json({ error: 'Unknown import kind' })
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    const wb = XLSX.readFile(req.file.path)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })
    if (data.length === 0) return res.status(400).json({ error: 'File is empty' })
    if (data.length > 1000) return res.status(400).json({ error: 'Maximum 1000 rows per import' })

    const aliases = {
      fullName: ['fullName', 'full_name', 'name', 'fullname'],
      full_name: ['fullName', 'full_name', 'name', 'fullname'],
      email: ['email', 'e-mail', 'emailaddress'],
      phone: ['phone', 'phone_number', 'phonenumber', 'mobile'],
      dob: ['dob', 'date_of_birth', 'dateofbirth', 'birthdate', 'birth_date', 'birthday'],
      skill_level: ['skillLevel', 'skill_level', 'skilllevel', 'skill', 'level'],
      skillLevel: ['skillLevel', 'skill_level', 'skilllevel', 'skill', 'level'],
      date: ['date', 'gamedate', 'game_date'],
      court_time: ['court_time', 'courtime', 'court & time', 'courttime'],
      format: ['format', 'gameformat'],
      side_a: ['side_a', 'sidea', 'side a', 'playerA', 'player_a', 'player1'],
      side_b: ['side_b', 'sideb', 'side b', 'playerB', 'player_b', 'player2'],
      score_a: ['score_a', 'scorea', 'score_a', 'score1'],
      score_b: ['score_b', 'scoreb', 'score_b', 'score2'],
      player: ['player', 'player_name', 'playername', 'playerText', 'player_text'],
      session_type: ['session_type', 'sessiontype', 'type'],
      time: ['time', 'timeslot', 'time_slot'],
      court: ['court', 'court_number', 'courtnumber'],
      ref: ['ref', 'booking_ref', 'bookingref', 'reference'],
      amount_paid: ['amount_paid', 'amountpaid', 'amount paid', 'amount'],
      payment_method: ['payment_method', 'paymentmethod', 'method', 'payment method'],
      payment_date: ['payment_date', 'paymentdate', 'payment date'],
      player_name: ['player_name', 'playername', 'player'],
      sessions: ['sessions', 'session_dates', 'sessiondates'],
      total: ['total', 'total_amount', 'totalamount', 'amount'],
      status: ['status', 'bookingstatus'],
      paid: ['paid', 'is_paid', 'ispaid'],
      amountPaid: ['amountPaid', 'amount_paid', 'amountpaid', 'amount paid'],
      mode: ['mode', 'importmode', 'import mode'],
    }

    const keys = Object.keys(data[0])
    const normalizedKeys = keys.map(k => normalizeHeader(k))
    const colMap = {}

    for (const [field, names] of Object.entries(aliases)) {
      const found = keys.find((k, i) => {
        const nk = normalizedKeys[i]
        return names.includes(k) || names.includes(nk) || names.some(n => nk.includes(n))
      })
      if (found) colMap[field] = found
    }

    const rows = []
    const allErrors = []
    for (let i = 0; i < data.length; i++) {
      const mapped = {}
      for (const [field, col] of Object.entries(colMap)) {
        const val = data[i][col]
        mapped[field] = val !== undefined && val !== null ? String(val).trim() : ''
      }
      const errors = tmpl.validate(mapped)
      allErrors.push(errors.length ? { row: i + 2, errors } : null)
      rows.push(mapped)
    }

    res.json({
      filename: req.file.originalname,
      totalRows: data.length,
      validRows: data.length - allErrors.filter(Boolean).length,
      errors: allErrors.filter(Boolean),
      preview: rows.slice(0, 20),
      allRows: rows,
    })
  } catch (err) {
    console.error('Preview error:', err)
    res.status(500).json({ error: 'Failed to parse file' })
  }
})

router.post('/:kind/commit', (req, res) => {
  try {
    const { kind } = req.params
    const { rows, filename } = req.body
    const tmpl = TEMPLATES[kind]
    if (!tmpl) return res.status(400).json({ error: 'Unknown import kind' })
    if (!rows || !Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'No rows to commit' })

    let processedRows = rows
    if (tmpl.transformations) {
      processedRows = rows.map(row => {
        const transformed = { ...row }
        for (const [field, fn] of Object.entries(tmpl.transformations)) {
          if (transformed[field] !== undefined) {
            transformed[field] = fn(transformed[field])
          }
        }
        return transformed
      })
    }

    if (tmpl.postProcess) {
      processedRows = tmpl.postProcess(processedRows)
    }

    let errorCount = 0
    for (const row of processedRows) { if (tmpl.validate(row).length) errorCount++ }
    const batch = db.insert('import_batches', { kind, filename: filename || 'unknown.xlsx', row_count: processedRows.length, error_count: errorCount, by_user: req.user.id, status: 'committed' })
    const inserted = tmpl.commit(processedRows, batch.id)
    res.json({ batchId: batch.id, kind, inserted, totalRows: processedRows.length, errorRows: errorCount })
  } catch (err) {
    console.error('Commit error:', err)
    res.status(500).json({ error: 'Commit failed' })
  }
})

router.get('/batches', (req, res) => {
  try {
    const batches = db.query('import_batches', { orderBy: (a, b) => new Date(b.created_at) - new Date(a.created_at) })
      .slice(0, 50)
      .map(b => {
        const u = b.by_user ? db.get('users', b.by_user) : null
        return { ...b, user_name: u ? u.name : null }
      })
    res.json(batches)
  } catch (err) {
    console.error('List batches error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
