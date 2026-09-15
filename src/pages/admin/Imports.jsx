import { useState, useEffect, useRef } from 'react'
import { CheckCircle2, Download, FileUp, Upload } from 'lucide-react'
import { api, downloadFile } from '../../lib/api'

export default function Imports() {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('players')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const fileRef = useRef()

  const fetchBatches = () => {
    setLoading(true)
    api.get('/imports/batches').then(setBatches).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { fetchBatches() }, [])

  const reset = () => { setFile(null); setPreview(null); setError(''); setResult(null) }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const data = await api.upload(`/imports/${activeTab}/preview`, fd)
      setPreview(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleCommit = async () => {
    setCommitting(true)
    try {
      const data = await api.post(`/imports/${activeTab}/commit`, { rows: preview.preview, filename: preview.filename })
      setResult(data)
      fetchBatches()
    } catch (err) {
      setError(err.message)
    } finally {
      setCommitting(false)
    }
  }

  const downloadTemplate = async () => {
    try {
      const blob = await downloadFile(`/imports/template/${activeTab}`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${activeTab}_import_template.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {}
  }

  const tabs = [
    { id: 'players', name: 'Players' },
    { id: 'results', name: 'Results' },
    { id: 'schedule', name: 'Schedule' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-black text-theme">Import Data</h1>
        <p className="text-muted text-sm mt-1">Upload Excel files to bulk import players, results, or schedule slots</p>
      </div>

      <div className="flex gap-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); reset() }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${activeTab === tab.id ? 'bg-lime-400 text-slate-950' : 'bg-surface border border-theme text-theme hover:bg-slate-200 dark:hover:bg-slate-800'}`}
          >
            {tab.name}
          </button>
        ))}
      </div>

      <div className="glass-panel rounded-2xl border border-theme p-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={downloadTemplate} className="px-4 py-2 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold flex items-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-800">
            <Download className="w-4 h-4" /> Download {activeTab} Template
          </button>
        </div>

        <div className="border-2 border-dashed border-theme rounded-xl p-8 text-center mb-4">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={e => { setFile(e.target.files[0]); setPreview(null); setResult(null) }} className="hidden" />
          <FileUp className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-muted text-sm mb-3">{file ? file.name : 'Drop your Excel file here or click to browse'}</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => fileRef.current.click()} className="px-4 py-2 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold">Choose File</button>
            {file && !preview && (
              <button onClick={handleUpload} disabled={uploading} className="px-4 py-2 rounded-xl bg-lime-400 text-slate-950 text-sm font-bold disabled:opacity-50 flex items-center gap-2">
                {uploading ? <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? 'Processing...' : 'Upload & Preview'}
              </button>
            )}
          </div>
        </div>

        {error && <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">{error}</div>}

        {result && (
          <div className="p-4 rounded-xl bg-lime-400/5 border border-lime-400/20 mb-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-5 h-5 text-lime-400" />
              <span className="text-theme font-bold text-sm">Import Successful</span>
            </div>
            <p className="text-muted text-xs">{result.inserted} {activeTab} imported from {result.totalRows} rows.</p>
          </div>
        )}

        {preview && !result && (
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

            <div className="flex gap-3">
              <button onClick={reset} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold">Cancel</button>
              <button onClick={handleCommit} disabled={committing || preview.validRows === 0} className="flex-1 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold text-sm disabled:opacity-50">
                {committing ? 'Importing...' : `Import ${preview.validRows} Valid Rows`}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="glass-panel rounded-2xl border border-theme p-6">
        <h3 className="text-lg font-bold text-theme mb-4">Import History</h3>
        {loading ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : batches.length === 0 ? (
          <p className="text-muted text-sm">No imports yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs uppercase">
                  <th className="text-left pb-3 font-semibold">Kind</th>
                  <th className="text-left pb-3 font-semibold">Filename</th>
                  <th className="text-left pb-3 font-semibold">Rows</th>
                  <th className="text-left pb-3 font-semibold">Errors</th>
                  <th className="text-left pb-3 font-semibold">By</th>
                  <th className="text-left pb-3 font-semibold">Status</th>
                  <th className="text-left pb-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme">
                {batches.map(b => (
                  <tr key={b.id}>
                    <td className="py-3 text-theme font-medium capitalize">{b.kind}</td>
                    <td className="py-3 text-theme">{b.filename}</td>
                    <td className="py-3 text-theme">{b.row_count}</td>
                    <td className="py-3 text-theme">{b.error_count}</td>
                    <td className="py-3 text-theme">{b.user_name || 'Unknown'}</td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-lime-400/10 text-lime-400">{b.status}</span>
                    </td>
                    <td className="py-3 text-muted text-xs">{new Date(b.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
