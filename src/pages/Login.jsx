import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, Lock, LogIn, Mail } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password.trim()) {
      setError('Please fill in both email and password.')
      return
    }
    setLoading(true)
    try {
      const u = await login(email, password)
      if (u.role === 'superadmin' || u.role === 'admin') {
        navigate('/admin')
      } else if (u.role === 'coach') {
        navigate('/admin/schedule')
      } else {
        navigate('/schedule')
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (user) {
    if (user.role === 'superadmin' || user.role === 'admin') return <Navigate to="/admin" replace />
    if (user.role === 'coach') return <Navigate to="/admin/schedule" replace />
    return <Navigate to="/schedule" replace />
  }

  return (
    <div className="min-h-screen bg-theme text-theme py-12 px-4 flex items-center justify-center relative overflow-hidden">
      <div className="absolute top-20 right-10 w-96 h-96 bg-brand/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-brand-text/80 shadow-lg shadow-brand/20 mx-auto mb-4 bg-surface flex items-center justify-center p-1">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="MM Padel Academy Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="font-heading text-3xl font-black text-theme">Member Login</h1>
          <p className="text-muted text-sm mt-1">Access your MM Padel Academy portal</p>
        </div>

        <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-theme shadow-2xl">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">{error}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-surface/90 border border-theme text-theme placeholder-muted text-sm focus:outline-none focus:border-brand-text focus:ring-1 focus:ring-brand-text transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-11 py-3 rounded-xl bg-surface/90 border border-theme text-theme placeholder-muted text-sm focus:outline-none focus:border-brand-text focus:ring-1 focus:ring-brand-text transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-theme"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-extrabold text-sm transition-all shadow-lg shadow-brand/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-5 text-center text-xs text-muted">
            Don&apos;t have an account?{' '}
            <Link to="/signup" className="text-brand-text font-semibold hover:underline">Create an Account</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
