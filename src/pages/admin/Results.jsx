import { useState, useEffect, useRef } from 'react'
import { AlertCircle, CheckCircle2, Download, Edit, FileUp, Plus, Search, Trash2, Upload, X, Check } from 'lucide-react'
import { api, downloadFile } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

function ResultModal({ result, onClose, onSave, isAdmin: adminOverride }) {
  const { isAdmin } = useAuth()
  const admin = adminOverride !== undefined ? adminOverride : isAdmin
  const [form, setForm] = useState({
    date: result?.date || new Date().toISOString().slice(0, 10),
    format: result?.format || 'short',
    sideA: result?.sideA || [''],
    sideB: result?.sideB || [''],
    score_a: result?.score_a ?? '',
    score_b: result?.score_b ?? '',
    court: result?.court || 1,
    competition: result?.competition || '',
    notes: result?.notes || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const scoreA = Number(form.score_a) || 0
  const scoreB = Number(form.score_b) || 0
  const scoresFilled = form.score_a !== '' && form.score_b !== ''
  const tie = scoresFilled && scoreA === scoreB
  const winnerPreview = scoresFilled && !tie
    ? (scoreA > scoreB ? form.sideA[0] : form.sideB[0])
    : null

  const updateSide = (side, idx, value) => {
    const arr = [...form[side]]
    arr[idx] = value
    setForm({ ...form, [side]: arr })
  }

  const addPlayer = (side) => {
    if (form[side].length < 2) setForm({ ...form, [side]: [...form[side], ''] })
  }

  const removePlayer = (side, idx) => {
    if (form[side].length > 1) setForm({ ...form, [side]: form[side].filter((_, i) => i !== idx) })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const payload = {
        date: form.date,
        format: form.format,
        sideA: form.sideA.map(s => s.trim()).filter(Boolean),
        sideB: form.sideB.map(s => s.trim()).filter(Boolean),
        score_a: scoreA,
        score_b: scoreB,
        court: form.court,
        competition: form.competition,
        notes: form.notes,
      }
      if (result) {
        await api.put(`/results/${result.id}`, payload)
      } else {
        await api.post('/results', payload)
      }
      onSave()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const canSubmit = form.date && form.sideA[0]?.trim() && form.sideB[0]?.trim() && scoresFilled && !tie

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-lg glass-panel rounded-2xl border border-theme shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-theme">{result ? 'Edit Result' : admin ? 'Add Match Result' : 'Submit Match Result'}</h3>
          <button onClick={onClose} className="p-2 text-muted hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        {error && <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Date *</label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Court</label>
              <select value={form.court} onChange={e => setForm({ ...form, court: parseInt(e.target.value) })} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400">
                <option value={1}>Court 1</option>
                <option value={2}>Court 2</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Format *</label>
            <div className="flex gap-2">
              {[{ v: 'short', l: 'Short Set' }, { v: 'long', l: 'Long Set' }, { v: 'tiebreak', l: 'Tiebreak' }].map(o => (
                <button key={o.v} type="button" onClick={() => setForm({ ...form, format: o.v })}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${form.format === o.v ? 'bg-lime-400 text-slate-950 border-lime-400' : 'bg-surface border-theme text-theme hover:border-lime-400'}`}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-lime-400 uppercase tracking-wider">Side A *</label>
              {form.sideA.map((name, i) => (
                <div key={i} className="flex gap-1">
                  <input type="text" value={name} onChange={e => updateSide('sideA', i, e.target.value)} required={i === 0} placeholder={`Player ${i + 1}`}
                    className="flex-1 px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
                  {form.sideA.length > 1 && <button type="button" onClick={() => removePlayer('sideA', i)} className="px-2 text-rose-400 hover:text-rose-300"><X className="w-4 h-4" /></button>}
                </div>
              ))}
              {form.sideA.length < 2 && <button type="button" onClick={() => addPlayer('sideA')} className="text-[10px] font-bold text-lime-400 hover:text-lime-300">+ Add Partner</button>}
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-rose-400 uppercase tracking-wider">Side B *</label>
              {form.sideB.map((name, i) => (
                <div key={i} className="flex gap-1">
                  <input type="text" value={name} onChange={e => updateSide('sideB', i, e.target.value)} required={i === 0} placeholder={`Player ${i + 1}`}
                    className="flex-1 px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
                  {form.sideB.length > 1 && <button type="button" onClick={() => removePlayer('sideB', i)} className="px-2 text-rose-400 hover:text-rose-300"><X className="w-4 h-4" /></button>}
                </div>
              ))}
              {form.sideB.length < 2 && <button type="button" onClick={() => addPlayer('sideB')} className="text-[10px] font-bold text-rose-400 hover:text-rose-300">+ Add Partner</button>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Score A *</label>
              <input type="number" min="0" value={form.score_a} onChange={e => setForm({ ...form, score_a: e.target.value === '' ? '' : parseInt(e.target.value) })} required className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Score B *</label>
              <input type="number" min="0" value={form.score_b} onChange={e => setForm({ ...form, score_b: e.target.value === '' ? '' : parseInt(e.target.value) })} required className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
            </div>
          </div>

          {scoresFilled && (
            <div className={`p-3 rounded-xl text-center text-sm font-bold ${tie ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'}`}>
              {tie ? 'Scores cannot be tied' : <>Winner: <span className="text-lime-400">{winnerPreview}</span></>}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Competition</label>
            <input type="text" value={form.competition} onChange={e => setForm({ ...form, competition: e.target.value })} placeholder="e.g. League, Tournament" className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400 resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme font-semibold text-sm hover:bg-slate-200 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" disabled={loading || !canSubmit} className="flex-1 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold text-sm disabled:opacity-50">
              {loading ? <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin mx-auto" /> : result ? 'Update Result' : admin ? 'Add Result' : 'Submit for Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ImportModal({ kind, onClose, onDone }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const fileRef = useRef()

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const data = await api.upload(`/imports/${kind}/preview`, fd)
      setPreview(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCommit = async () => {
    setCommitting(true)
    try {
      const data = await api.post(`/imports/${kind}/commit`, { rows: preview.preview, filename: preview.filename })
      setResult(data)
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setCommitting(false)
    }
  }

  const downloadTemplate = async () => {
    try {
      const blob = await downloadFile(`/imports/template/${kind}`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${kind}_import_template.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {}
  }

  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
        <div className="w-full max-w-md glass-panel rounded-2xl border border-theme shadow-2xl p-6 text-center">
          <CheckCircle2 className="w-12 h-12 text-lime-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-theme mb-2">Import Complete</h3>
          <p className="text-muted text-sm mb-4">{result.inserted} results imported successfully.</p>
          <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold text-sm">Done</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-2xl glass-panel rounded-2xl border border-theme shadow-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-theme">Import Results from Excel</h3>
          <button onClick={onClose} className="p-2 text-muted hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <button onClick={downloadTemplate} className="px-4 py-2 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold flex items-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-800 mb-4">
          <Download className="w-4 h-4" /> Download Template
        </button>
        <div className="border-2 border-dashed border-theme rounded-xl p-8 text-center mb-4">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={e => setFile(e.target.files[0])} className="hidden" />
          <FileUp className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-muted text-sm mb-3">{file ? file.name : 'Drop your Excel file here or click to browse'}</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => fileRef.current.click()} className="px-4 py-2 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold">Choose File</button>
            {file && <button onClick={handleUpload} disabled={loading} className="px-4 py-2 rounded-xl bg-lime-400 text-slate-950 text-sm font-bold disabled:opacity-50">{loading ? 'Processing...' : 'Upload & Preview'}</button>}
          </div>
        </div>
        {error && <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">{error}</div>}
        {preview && (
          <div>
            <div className="flex items-center gap-4 mb-3 text-sm">
              <span className="text-theme font-semibold">Total: {preview.totalRows}</span>
              <span className="text-lime-400 font-semibold">Valid: {preview.validRows}</span>
              {preview.errors.length > 0 && <span className="text-rose-400 font-semibold">Errors: {preview.errors.length}</span>}
            </div>
            {preview.errors.length > 0 && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs max-h-32 overflow-y-auto">
                {preview.errors.map((e, i) => <div key={i}>Row {e.row}: {e.errors.join(', ')}</div>)}
              </div>
            )}
            <div className="overflow-x-auto max-h-64 overflow-y-auto mb-4">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-muted uppercase">
                    {preview.preview[0] && Object.keys(preview.preview[0]).map(k => <th key={k} className="text-left px-3 py-2 font-semibold">{k}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme">
                  {preview.preview.map((row, i) => (
                    <tr key={i} className="text-theme">
                      {Object.values(row).map((v, j) => <td key={j} className="px-3 py-2">{v}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={handleCommit} disabled={committing || preview.validRows === 0} className="w-full py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold text-sm disabled:opacity-50">
              {committing ? 'Importing...' : `Import ${preview.validRows} Valid Rows`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Results() {
  const { isAdmin } = useAuth()
  const canEdit = isAdmin
  const [results, setResults] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [editResult, setEditResult] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const fetchResults = () => {
    setLoading(true)
    const params = new URLSearchParams({ page, limit: 20 })
    if (search) params.set('player', search)
    if (isAdmin && statusFilter !== 'all') params.set('status', statusFilter)
    api.get(`/results?${params}`).then(data => { setResults(data.results); setTotal(data.total) }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { fetchResults() }, [page, statusFilter])

  const handleSearch = (e) => { e.preventDefault(); setPage(1); fetchResults() }
  const handleDelete = async (id) => { try { await api.del(`/results/${id}`); setDeleteConfirm(null); fetchResults() } catch {} }
  const handleConfirm = async (id) => { try { await api.put(`/results/${id}/confirm`); fetchResults() } catch {} }

  const totalPages = Math.ceil(total / 20)

  const statusTabs = [
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'Pending' },
    { id: 'confirmed', label: 'Confirmed' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-black text-theme">Results</h1>
          <p className="text-muted text-sm mt-1">{total} total match results</p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <>
              <button onClick={() => setShowImport(true)} className="px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold flex items-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-800">
                <Upload className="w-4 h-4" /> Import Excel
              </button>
              <button onClick={() => setShowAdd(true)} className="px-4 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-sm font-bold flex items-center gap-2">
                <Plus className="w-4 h-4" /> Add Result
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        {isAdmin && (
          <div className="flex gap-1 bg-surface border border-theme rounded-xl p-1">
            {statusTabs.map(tab => (
              <button key={tab.id} onClick={() => { setStatusFilter(tab.id); setPage(1) }}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === tab.id ? 'bg-lime-400 text-slate-950' : 'text-muted hover:text-slate-900 dark:hover:text-white'}`}>
                {tab.label}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by player name..." className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
          </div>
          <button type="submit" className="px-4 py-2.5 rounded-xl bg-surface text-theme text-sm font-semibold hover:bg-slate-300 dark:hover:bg-slate-700">Search</button>
        </form>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" /></div>
      ) : results.length === 0 ? (
        <div className="text-center py-12 text-muted">No results found.</div>
      ) : (
        <div className="glass-panel rounded-2xl border border-theme overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs uppercase border-b border-theme">
                  <th className="text-left px-6 py-4 font-semibold">Date</th>
                  <th className="text-left px-6 py-4 font-semibold">Format</th>
                  <th className="text-left px-6 py-4 font-semibold">Side A</th>
                  <th className="text-left px-6 py-4 font-semibold">Side B</th>
                  <th className="text-center px-6 py-4 font-semibold">Score</th>
                  <th className="text-left px-6 py-4 font-semibold">Winner</th>
                  <th className="text-left px-6 py-4 font-semibold">Status</th>
                  <th className="text-right px-6 py-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme">
                {results.map(r => {
                  const sideA = r.sideA || [r.player_a].filter(Boolean)
                  const sideB = r.sideB || [r.player_b].filter(Boolean)
                  return (
                    <tr key={r.id} className="hover:bg-white/50 dark:hover:bg-slate-900/50 transition-colors">
                      <td className="px-6 py-4 text-theme text-xs whitespace-nowrap">{r.date}</td>
                      <td className="px-6 py-4 text-xs">
                        <span className="px-2 py-0.5 rounded-full bg-surface text-theme font-semibold capitalize">{r.format || '-'}</span>
                      </td>
                      <td className="px-6 py-4 font-semibold text-theme text-xs">{sideA.join(' & ')}</td>
                      <td className="px-6 py-4 font-semibold text-theme text-xs">{sideB.join(' & ')}</td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-lime-400 font-bold">{r.score_a}</span>
                        <span className="text-muted mx-1">-</span>
                        <span className="text-lime-400 font-bold">{r.score_b}</span>
                      </td>
                      <td className="px-6 py-4 text-theme text-xs">{r.winner || '-'}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${r.status === 'confirmed' ? 'bg-emerald-400/20 text-emerald-400' : 'bg-amber-400/20 text-amber-400'}`}>
                          {r.status || 'confirmed'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && r.status === 'pending' && (
                            <button onClick={() => handleConfirm(r.id)} title="Confirm" className="p-2 text-emerald-400 hover:bg-emerald-400/10 rounded-lg"><Check className="w-4 h-4" /></button>
                          )}
                          {canEdit && (
                            <>
                              <button onClick={() => setEditResult(r)} className="p-2 text-muted hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg"><Edit className="w-4 h-4" /></button>
                              <button onClick={() => setDeleteConfirm(r)} className="p-2 text-muted hover:text-rose-400 hover:bg-rose-500/10 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg bg-surface border border-theme text-theme text-sm disabled:opacity-50">Prev</button>
          <span className="text-sm text-muted">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 rounded-lg bg-surface border border-theme text-theme text-sm disabled:opacity-50">Next</button>
        </div>
      )}

      {(showAdd || editResult) && <ResultModal result={editResult} onClose={() => { setShowAdd(false); setEditResult(null) }} onSave={() => { setShowAdd(false); setEditResult(null); fetchResults() }} />}
      {showImport && <ImportModal kind="results" onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); fetchResults() }} />}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-theme shadow-2xl p-6 text-center">
            <AlertCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-theme mb-2">Delete Result?</h3>
            <p className="text-muted text-sm mb-6">This match result will be permanently deleted.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm.id)} className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-sm font-bold">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
