import { useState, useEffect } from 'react'
import { DollarSign, Plus, Trash2, X } from 'lucide-react'
import { api } from '../../lib/api'

const CATEGORIES = ['Court Booking Fees', 'Equipment', 'Salaries', 'Utilities', 'Other']

function ExpenseModal({ onClose, onSave }) {
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), category: 'Court Booking Fees', description: '', amount: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await api.post('/expenses', { ...form, amount: Number(form.amount) })
      onSave()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-lg glass-panel rounded-2xl border border-theme shadow-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-theme">Add Expense</h3>
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
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Category *</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Description *</label>
            <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required placeholder="e.g. Replaced net on Court 1" className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Amount (EGP) *</label>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme font-semibold text-sm">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold text-sm disabled:opacity-50">
              {loading ? <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin mx-auto" /> : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Expenses() {
  const [expenses, setExpenses] = useState([])
  const [total, setTotal] = useState(0)
  const [totalAmount, setTotalAmount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const fetchExpenses = () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (categoryFilter) params.set('category', categoryFilter)
    api.get(`/expenses?${params}`).then(data => {
      setExpenses(data.expenses); setTotal(data.total); setTotalAmount(data.totalAmount)
    }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { fetchExpenses() }, [from, to, categoryFilter])

  const handleDelete = async (id) => {
    try { await api.del(`/expenses/${id}`); setDeleteConfirm(null); fetchExpenses() } catch {}
  }

  const catColors = {
    'Court Booking Fees': 'bg-blue-500/10 text-blue-400',
    'Equipment': 'bg-purple-500/10 text-purple-400',
    'Salaries': 'bg-amber-500/10 text-amber-400',
    'Utilities': 'bg-cyan-500/10 text-cyan-400',
    'Other': 'bg-slate-500/10 text-slate-400',
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-black text-theme">Expenses</h1>
          <p className="text-muted text-sm mt-1">{total} expenses · Total: <strong className="text-theme">EGP {totalAmount.toLocaleString()}</strong></p>
        </div>
        <button onClick={() => setShowAdd(true)} className="px-4 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-sm font-bold flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Expense
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2 items-center">
          <label className="text-xs font-bold text-muted">From:</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs font-bold focus:outline-none focus:border-lime-400" />
        </div>
        <div className="flex gap-2 items-center">
          <label className="text-xs font-bold text-muted">To:</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs font-bold focus:outline-none focus:border-lime-400" />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="px-4 py-2 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400">
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" /></div>
      ) : expenses.length === 0 ? (
        <div className="text-center py-12 text-muted">No expenses recorded.</div>
      ) : (
        <div className="glass-panel rounded-2xl border border-theme overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs uppercase border-b border-theme">
                  <th className="text-left px-6 py-4 font-semibold">Date</th>
                  <th className="text-left px-6 py-4 font-semibold">Category</th>
                  <th className="text-left px-6 py-4 font-semibold">Description</th>
                  <th className="text-right px-6 py-4 font-semibold">Amount</th>
                  <th className="text-right px-6 py-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme">
                {expenses.map(e => (
                  <tr key={e.id} className="hover:bg-white/50 dark:hover:bg-slate-900/50 transition-colors">
                    <td className="px-6 py-4 text-theme text-xs">{e.date}</td>
                    <td className="px-6 py-4"><span className={`px-2.5 py-1 rounded-full text-xs font-bold ${catColors[e.category] || catColors.Other}`}>{e.category}</span></td>
                    <td className="px-6 py-4 text-theme text-sm">{e.description}</td>
                    <td className="px-6 py-4 text-right font-bold text-theme">EGP {Number(e.amount).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => setDeleteConfirm(e)} className="p-2 text-muted hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 border-t border-theme flex justify-end">
            <span className="text-sm font-bold text-theme">Total: EGP {totalAmount.toLocaleString()}</span>
          </div>
        </div>
      )}

      {showAdd && <ExpenseModal onClose={() => setShowAdd(false)} onSave={() => { setShowAdd(false); fetchExpenses() }} />}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-sm glass-panel rounded-2xl border border-theme shadow-2xl p-6 text-center">
            <DollarSign className="w-12 h-12 text-rose-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-theme mb-2">Delete Expense?</h3>
            <p className="text-muted text-sm mb-6">Are you sure you want to delete this expense record?</p>
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
