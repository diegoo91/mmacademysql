import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Lock,
  MessageCircle,
  Printer,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'
import { CONTACT } from '../data/siteConfig'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

export default function Payment() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const booking = location.state || null
  const { sessionType, sessions = [], totalPrice = 0, sessionCount = 0, mode } = booking || {}

  const [copied, setCopied] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [bookingConfirmed, setBookingConfirmed] = useState(false)
  const [bookingReference, setBookingReference] = useState('')
  const [error, setError] = useState('')

  const sessionLabel = sessionType === 'private' ? 'Private Coaching' : sessionType === 'group' ? 'Group (2 Persons)' : ''

  const handleCopyLink = async () => {
    try { await navigator.clipboard.writeText(CONTACT.instapayUrl) } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleConfirm = async (e) => {
    e.preventDefault()
    setIsProcessing(true)
    setError('')
    try {
      const data = await api.post('/bookings', {
        sessionType,
        mode,
        sessions: sessions.map(s => ({ date: s.date, time: s.time, court: s.court, label: s.label })),
        totalPrice,
      })
      setBookingReference(data.ref)
      setBookingConfirmed(true)
    } catch (err) {
      setError(err.message || 'Failed to create booking. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  if (bookingConfirmed) {
    const playerName = user?.name || 'Player'
    const sessionList = sessions.map(s => s.label).join('%0A')
    const waMessage = `Hi MM Padel Academy!%0A%0ABooking Reference: ${bookingReference}%0AName: ${playerName}%0ASessions: ${sessionCount} ${sessionLabel}%0ATotal: ${totalPrice.toLocaleString()} EGP%0A%0APayment has been completed via InstaPay. Please confirm my booking.`
    const waUrl = `https://wa.me/201000915244?text=${waMessage}`

    return (
      <div className="min-h-screen bg-theme text-theme py-16 px-4 flex items-center justify-center relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-lime-500/15 rounded-full blur-[150px] pointer-events-none" />
        <div className="max-w-xl w-full glass-panel rounded-3xl p-8 border border-theme shadow-2xl relative z-10 space-y-6 text-center animate-fadeIn">
          <div className="w-20 h-20 bg-lime-400 text-slate-950 rounded-3xl mx-auto flex items-center justify-center font-bold shadow-2xl shadow-lime-400/30">
            <CheckCircle2 className="w-12 h-12 stroke-[2.5]" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Booking Pending Admin Confirmation</span>
            </div>
            <h1 className="font-heading text-3xl font-black text-theme">Booking Submitted!</h1>
            <p className="text-theme text-sm mt-1">Your booking is pending. Send your payment screenshot on WhatsApp to get confirmed.</p>
          </div>

          <div className="bg-surface/90 rounded-2xl p-6 border border-theme text-left space-y-4">
            <div className="flex items-center justify-between border-b border-theme pb-3">
              <div>
                <span className="text-[10px] text-muted uppercase tracking-widest font-semibold block">Booking Reference ID</span>
                <span className="font-mono text-xl font-extrabold text-lime-400">{bookingReference}</span>
              </div>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-400 text-slate-950 uppercase">Pending</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div><span className="text-muted block">Session Category:</span><span className="text-theme font-bold">{sessionLabel}</span></div>
              <div><span className="text-muted block">Sessions:</span><span className="text-lime-400 font-bold">{sessionCount}</span></div>
              <div><span className="text-muted block">Total Paid:</span><span className="text-lime-400 font-extrabold">{totalPrice.toLocaleString()} EGP</span></div>
              <div><span className="text-muted block">Confirm on:</span><a href={CONTACT.phoneHref} className="text-theme font-semibold hover:text-lime-400">{CONTACT.phone}</a></div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-3 rounded-xl bg-green-500 hover:bg-green-400 text-theme font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-500/25"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Send Screenshot on WhatsApp</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button onClick={() => window.print()} className="flex-1 py-3 rounded-xl bg-surface hover:bg-slate-200 dark:hover:bg-slate-800 text-theme font-bold text-xs border border-theme flex items-center justify-center gap-2 transition-all">
              <Printer className="w-4 h-4" /><span>Print Receipt</span>
            </button>
            <Link to="/" className="flex-1 py-3 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-lime-400/20 transition-all">
              <span>Return to Home</span><ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-theme text-theme py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-10 right-1/4 w-[500px] h-[300px] bg-lime-500/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => navigate('/book')} className="inline-flex items-center gap-2 text-xs font-bold text-muted hover:text-slate-900 dark:hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /><span>Back to Booking Selection</span>
          </button>
          <div className="flex items-center gap-2 text-xs text-lime-400 bg-lime-400/10 px-3 py-1.5 rounded-full border border-lime-400/30 font-semibold">
            <Lock className="w-3.5 h-3.5" /><span>Official InstaPay Checkout</span>
          </div>
        </div>

        {!booking ? (
          <div className="glass-panel rounded-3xl p-10 text-center border border-theme">
            <p className="text-theme mb-6">No booking summary found. Please start a booking first.</p>
            <Link to="/book" className="inline-block px-6 py-3 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold text-sm">Book a Session</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 glass-panel rounded-3xl p-6 sm:p-8 border border-theme shadow-2xl space-y-6">
              <div className="flex items-center justify-between border-b border-theme pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-600 text-theme flex items-center justify-center font-black text-xs shadow-lg shadow-purple-600/30">IPN</div>
                  <div>
                    <h2 className="font-heading text-xl font-extrabold text-theme">Pay via InstaPay</h2>
                    <p className="text-xs text-muted">Official National Instant Transfer</p>
                  </div>
                </div>
                <span className="text-[11px] font-extrabold px-3 py-1 rounded-full bg-lime-400 text-slate-950 uppercase tracking-wider">Instant Transfer</span>
              </div>

              <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-purple-950/40 border border-purple-500/30 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-purple-300">InstaPay Payment Link</span>
                    <p className="font-heading text-2xl font-black text-theme mt-0.5">{totalPrice.toLocaleString()} <span className="text-sm font-bold text-lime-400">EGP</span></p>
                  </div>
                  <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300"><Zap className="w-5 h-5" /></div>
                </div>

                <div className="p-3.5 rounded-xl bg-theme/90 border border-theme flex items-center justify-between gap-3">
                  <div className="truncate font-mono text-xs text-lime-400 font-semibold select-all">{CONTACT.instapayUrl}</div>
                  <button onClick={handleCopyLink} type="button" className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-theme text-xs font-bold shrink-0 flex items-center gap-1.5 transition-colors">
                    {copied ? <Check className="w-3.5 h-3.5 text-lime-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>

                <a href={CONTACT.instapayUrl} target="_blank" rel="noreferrer" className="w-full py-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 text-theme font-extrabold text-sm shadow-xl shadow-purple-600/30 flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99]">
                  <span>Pay with InstaPay</span><ExternalLink className="w-4 h-4" />
                </a>
              </div>

              {error && <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">{error}</div>}

              <form onSubmit={handleConfirm} className="space-y-4 pt-2 border-t border-theme">
                <h3 className="text-sm font-bold text-theme uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-lime-400" /><span>Confirm Your Reservation</span>
                </h3>
                <p className="text-xs text-muted leading-relaxed">
                  Complete your payment via InstaPay using the link above, then send your payment screenshot to us on WhatsApp/phone to confirm your booking:{' '}
                  <a href={CONTACT.phoneHref} className="text-lime-400 font-bold hover:underline">{CONTACT.phone}</a>
                </p>
                <button type="submit" disabled={isProcessing} className="w-full py-4 rounded-2xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-black text-base shadow-xl shadow-lime-400/25 flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50">
                  {isProcessing ? (
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Creating Booking...</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span>I Have Completed Payment ({totalPrice.toLocaleString()} EGP)</span>
                      <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                    </span>
                  )}
                </button>
              </form>
            </div>

            <div className="lg:col-span-5">
              <div className="glass-panel rounded-3xl p-6 border border-theme shadow-2xl space-y-6">
                <div className="border-b border-theme pb-4">
                  <span className="text-[10px] uppercase font-bold text-lime-400 tracking-widest block">Order Summary</span>
                  <h3 className="font-heading text-lg font-extrabold text-theme mt-0.5">Reservation Breakdown</h3>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="p-4 rounded-2xl bg-surface/90 border border-theme space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-theme text-sm">{sessionLabel}</span>
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded bg-lime-400/20 text-lime-400">
                        {sessionCount} session{sessionCount === 1 ? '' : 's'} • {mode === 'day' ? 'Per Day' : 'Per Week'}
                      </span>
                    </div>
                    <ul className="space-y-1.5 pt-2 border-t border-theme max-h-56 overflow-y-auto pr-1">
                      {sessions.map((s, i) => (
                        <li key={i} className="text-muted">• {s.label}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-2 border-t border-theme flex justify-between items-center">
                    <span className="font-extrabold text-theme text-base">Total Amount Due</span>
                    <div className="text-right">
                      <span className="font-heading text-3xl font-black text-lime-400">{totalPrice.toLocaleString()}</span>
                      <span className="text-xs font-bold text-theme ml-1">EGP</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-purple-950/20 border border-purple-500/30 text-[11px] text-muted leading-relaxed">
                  Confirmation contact: <a href={CONTACT.phoneHref} className="text-purple-300 font-bold hover:underline">{CONTACT.phone}</a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
