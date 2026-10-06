import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, Lock, Mail, Smartphone, X } from 'lucide-react'
import { useAuth, adminLandingPath } from '../context/AuthContext'
import { useEscapeKey } from '../lib/hooks'
import Logo from './Logo'

export default function LoginModal() {
  const { isLoginModalOpen, closeLoginModal, login } = useAuth()
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEscapeKey(closeLoginModal, isLoginModalOpen)

  if (!isLoginModalOpen) return null

  const isPhone = /^[+\d][\d\s.()\-]{7,}$/.test(identifier.trim()) && !identifier.includes('@')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!identifier.trim() || !password.trim()) {
      setError('Please fill in both your email/mobile number and password.')
      return
    }
    setLoading(true)
    try {
      const u = await login(identifier.trim(), password)
      closeLoginModal()
      navigate(adminLandingPath(u))
    } catch (err) {
      setError(err.message || 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleDemoLogin = async () => {
    setIdentifier('player@mmpadel.com')
    setPassword('padel2026')
    setLoading(true)
    setError('')
    try {
      const u = await login('player@mmpadel.com', 'padel2026')
      closeLoginModal()
      navigate(adminLandingPath(u))
    } catch {
      setError('Demo login failed. The demo account may not exist yet.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-theme/80 backdrop-blur-md animate-fadeIn" role="dialog" aria-modal="true" aria-labelledby="modal-title-0">
      <div className="relative w-full max-w-md p-6 overflow-hidden glass-panel rounded-2xl border border-theme shadow-2xl">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-brand/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <button
          onClick={closeLoginModal}
          className="absolute top-4 right-4 p-2 text-muted hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60 rounded-full transition-colors"
          aria-label="Close login"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <Logo className="w-16 h-16 rounded-2xl border-2 border-brand-text/80 shadow-lg shadow-brand/20 mx-auto mb-3" />
          <h3 id="modal-title-0" className="text-2xl font-bold font-heading text-theme">Welcome Back</h3>
          <p className="text-sm text-muted mt-1">Access your MM Padel Academy member portal</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="modal-identifier" className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">
              Email or Mobile Number
            </label>
            <div className="relative">
              {isPhone ? (
                <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
              ) : (
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
              )}
              <input
                id="modal-identifier"
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="name@example.com or 01000000000"
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-surface/90 border border-theme text-muted focus:outline-none focus:border-brand-text focus:ring-1 focus:ring-brand-text text-sm transition-all"
              />
            </div>
          </div>

          <div>
            <label htmlFor="modal-password" className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
              <input
                id="modal-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-11 pr-11 py-3 rounded-xl bg-surface/90 border border-theme text-theme text-muted focus:outline-none focus:border-brand-text focus:ring-1 focus:ring-brand-text text-sm transition-all"
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
            className="w-full py-3.5 px-4 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-sm transition-all shadow-lg shadow-brand/20 flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Sign In to Portal</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-4 pt-4 border-t border-theme text-center">
          <button
            onClick={handleDemoLogin}
            type="button"
            className="text-xs text-brand-text hover:text-brand-text font-medium underline underline-offset-4"
          >
            Auto-fill Demo Account (Alex Morgan)
          </button>
        </div>

        <div className="mt-5 text-center text-xs text-muted">
          Don&apos;t have an account yet?{' '}
          <Link to="/signup" onClick={closeLoginModal} className="text-brand-text font-semibold hover:underline">
            Create an Account
          </Link>
        </div>
      </div>
    </div>
  )
}
