import { useState } from 'react'
import { CheckCircle, Send } from 'lucide-react'

export default function GuestBooking() {
  const [form, setForm] = useState({
    guest_name: '', guest_phone: '', guest_email: '',
    preferred_date: '', preferred_time: '', preferred_court: '',
    session_type: 'private', notes: '',
  })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.guest_name || !form.guest_phone) {
      setError('Name and phone are required')
      return
    }
    setLoading(true)
    try {
      const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5174/api'
      const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '')
      const res = await fetch(`${API_ORIGIN}/api/guest-booking-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      setSuccess(true)
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md glass-panel rounded-3xl border border-theme shadow-2xl p-8 text-center">
          <CheckCircle className="w-16 h-16 text-brand-text mx-auto mb-4" />
          <h2 className="font-heading text-2xl font-black text-theme mb-2">Request Submitted!</h2>
          <p className="text-muted text-sm mb-6">Thank you, {form.guest_name}. We will contact you shortly to confirm your booking.</p>
          <button onClick={() => { setSuccess(false); setForm({ guest_name: '', guest_phone: '', guest_email: '', preferred_date: '', preferred_time: '', preferred_court: '', session_type: 'private', notes: '' }) }} className="w-full py-3 rounded-xl bg-brand text-slate-900 font-bold text-sm">
            Book Another Session
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="font-heading text-3xl font-black text-theme mb-2">Book a Session</h1>
        <p className="text-muted text-sm">Fill in your details below and we will get back to you to confirm.</p>
      </div>

      <form onSubmit={handleSubmit} className="glass-panel rounded-3xl border border-theme p-6 sm:p-8 space-y-4">
        <div>
          <label className="block text-xs font-bold text-muted uppercase">Full Name *</label>
          <input name="guest_name" value={form.guest_name} onChange={handleChange} required className="w-full mt-1 px-4 py-3 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text" placeholder="Your name" />
        </div>
        <div>
          <label className="block text-xs font-bold text-muted uppercase">Phone *</label>
          <input name="guest_phone" value={form.guest_phone} onChange={handleChange} required className="w-full mt-1 px-4 py-3 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text" placeholder="Phone number" />
        </div>
        <div>
          <label className="block text-xs font-bold text-muted uppercase">Email (optional)</label>
          <input name="guest_email" type="email" value={form.guest_email} onChange={handleChange} className="w-full mt-1 px-4 py-3 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text" placeholder="Email" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-muted uppercase">Preferred Date</label>
            <input name="preferred_date" type="date" value={form.preferred_date} onChange={handleChange} className="w-full mt-1 px-4 py-3 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text" />
          </div>
          <div>
            <label className="block text-xs font-bold text-muted uppercase">Preferred Time</label>
            <input name="preferred_time" type="time" value={form.preferred_time} onChange={handleChange} className="w-full mt-1 px-4 py-3 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-muted uppercase">Session Type</label>
            <select name="session_type" value={form.session_type} onChange={handleChange} className="w-full mt-1 px-4 py-3 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text">
              <option value="private">Private</option>
              <option value="group">Group</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-muted uppercase">Court</label>
            <select name="preferred_court" value={form.preferred_court} onChange={handleChange} className="w-full mt-1 px-4 py-3 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text">
              <option value="">Any</option>
              <option value="1">Court 1</option>
              <option value="2">Court 2</option>
              <option value="3">Court 3</option>
              <option value="4">Court 4</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-muted uppercase">Notes (optional)</label>
          <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} className="w-full mt-1 px-4 py-3 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text resize-none" placeholder="Any special requests..." />
        </div>

        {error && <p className="text-rose-400 text-xs font-bold text-center">{error}</p>}

        <button type="submit" disabled={loading} className="w-full py-3.5 rounded-xl bg-gold hover:bg-gold-hover text-slate-950 font-extrabold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2">
          {loading ? <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
          {loading ? 'Submitting...' : 'Submit Booking Request'}
        </button>
      </form>
    </div>
  )
}
