import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  Trophy,
  User,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const skillOptions = [
  { id: 'Beginner', name: 'Beginner', rating: 'New', desc: 'New to padel or learning basic strokes & court rules.' },
  { id: 'Intermediate', name: 'Intermediate', rating: '3.0 – 4.0', desc: 'Consistent rally player, learning glass defence & bandejas.' },
  { id: 'Advanced', name: 'Advanced', rating: '4.5+', desc: 'Competitive player with advanced tactics & fast pace.' },
]

export default function SignUp() {
  const { signup, openLoginModal } = useAuth()
  const navigate = useNavigate()

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    dob: '',
    password: '',
    confirmPassword: '',
    skillLevel: 'Intermediate',
  })

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [serverError, setServerError] = useState('')

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }))
    setServerError('')
  }

  const validate = () => {
    const next = {}
    if (!formData.fullName.trim()) next.fullName = 'Full name is required'
    if (!formData.email.trim()) next.email = 'Email address is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) next.email = 'Please enter a valid email address'
    if (!formData.phone.trim()) next.phone = 'Phone number is required'
    else if (formData.phone.replace(/\D/g, '').length < 8) next.phone = 'Please enter a valid phone number'
    if (!formData.dob) next.dob = 'Date of birth is required'
    if (!formData.password) next.password = 'Password is required'
    else if (formData.password.length < 8) next.password = 'Password must be at least 8 characters long'
    if (!formData.confirmPassword) next.confirmPassword = 'Confirming password is required'
    else if (formData.password !== formData.confirmPassword) next.confirmPassword = 'Passwords do not match'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setIsSubmitting(true)
    setServerError('')
    try {
      await signup({
        name: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        dob: formData.dob,
        password: formData.password,
        skillLevel: formData.skillLevel,
      })
      setIsSubmitted(true)
    } catch (err) {
      setServerError(err.message || 'Registration failed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClass = (hasError) =>
    `w-full pl-11 pr-4 py-3 rounded-xl bg-surface/90 border text-theme placeholder-muted text-sm focus:outline-none transition-all ${
      hasError
        ? 'border-rose-500 focus:ring-1 focus:ring-rose-500'
        : 'border-theme focus:border-lime-400 focus:ring-1 focus:ring-lime-400'
    }`

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-theme flex items-center justify-center p-4">
        <div className="max-w-md w-full glass-panel rounded-3xl p-8 text-center border border-theme shadow-2xl relative overflow-hidden animate-fadeIn">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-lime-500/20 rounded-full blur-3xl" />
          <div className="w-16 h-16 bg-lime-400 text-slate-950 rounded-2xl mx-auto flex items-center justify-center font-bold mb-6 shadow-xl shadow-lime-400/30">
            <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
          </div>
          <h2 className="font-heading text-3xl font-extrabold text-theme mb-2">Welcome to MM Padel Academy!</h2>
          <p className="text-theme text-sm mb-6 leading-relaxed">
            Your player account for <span className="text-lime-400 font-bold">{formData.fullName}</span> has been
            successfully created.
          </p>
          <div className="bg-surface/90 rounded-2xl p-4 mb-6 text-left border border-theme text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-muted">Account Email:</span>
              <span className="text-theme font-semibold">{formData.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Selected Skill Level:</span>
              <span className="text-lime-400 font-semibold">{formData.skillLevel}</span>
            </div>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => navigate('/book')}
              className="w-full py-3.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold text-sm shadow-lg shadow-lime-400/20 flex items-center justify-center gap-2 transition-all"
            >
              <Calendar className="w-4 h-4" />
              <span>Book Your First Session Now</span>
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full py-3.5 rounded-xl bg-surface text-theme font-bold text-sm border border-theme transition-all"
            >
              Go to Home Page
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-theme text-theme py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-20 right-10 w-96 h-96 bg-lime-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-20 left-10 w-96 h-96 bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-3xl mx-auto relative z-10">
        <div className="text-center space-y-3 mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-lime-400/10 border border-lime-400/30 text-lime-400 text-xs font-bold uppercase tracking-widest">
            <Trophy className="w-4 h-4" />
            <span>Join the Community</span>
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl font-black text-theme">Create Your Academy Account</h1>
          <p className="text-muted text-sm max-w-md mx-auto">
            Get instant access to court reservations, coaching programs, and member sessions.
          </p>
        </div>

        <div className="glass-panel rounded-3xl p-6 sm:p-10 border border-theme shadow-2xl">
          {serverError && (
            <div className="mb-6 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">{serverError}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-2">
                  Full Name <span className="text-lime-400">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                  <input type="text" name="fullName" value={formData.fullName} onChange={handleChange} placeholder="e.g. Ahmed Salah" className={inputClass(errors.fullName)} />
                </div>
                {errors.fullName && (
                  <p className="text-rose-400 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /><span>{errors.fullName}</span></p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-2">
                  Email Address <span className="text-lime-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                  <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="name@domain.com" className={inputClass(errors.email)} />
                </div>
                {errors.email && (
                  <p className="text-rose-400 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /><span>{errors.email}</span></p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-2">
                  Phone Number <span className="text-lime-400">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                  <input type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder="+20 10 0000 0000" className={inputClass(errors.phone)} />
                </div>
                {errors.phone && (
                  <p className="text-rose-400 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /><span>{errors.phone}</span></p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-2">
                  Date of Birth <span className="text-lime-400">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                  <input type="date" name="dob" value={formData.dob} onChange={handleChange} className={inputClass(errors.dob)} />
                </div>
                {errors.dob && (
                  <p className="text-rose-400 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /><span>{errors.dob}</span></p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-2">
                  Password <span className="text-lime-400">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Min 8 characters"
                    className={`${inputClass(errors.password)} pr-11`}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-theme" aria-label="Toggle password visibility">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-rose-400 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /><span>{errors.password}</span></p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-2">
                  Confirm Password <span className="text-lime-400">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="Re-enter password"
                    className={`${inputClass(errors.confirmPassword)} pr-11`}
                  />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-theme" aria-label="Toggle confirm password visibility">
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-rose-400 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /><span>{errors.confirmPassword}</span></p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-3">
                Skill Level <span className="text-lime-400">*</span>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {skillOptions.map((opt) => {
                  const selected = formData.skillLevel === opt.id
                  return (
                    <div
                      key={opt.id}
                      onClick={() => setFormData({ ...formData, skillLevel: opt.id })}
                      className={`p-4 rounded-2xl cursor-pointer transition-all border ${
                        selected
                          ? 'bg-lime-400/10 border-lime-400 ring-1 ring-lime-400'
                          : 'bg-surface/60 border-theme hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-extrabold text-theme text-sm">{opt.name}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface text-lime-400 border border-theme">{opt.rating}</span>
                      </div>
                      <p className="text-xs text-muted leading-relaxed">{opt.desc}</p>
                    </div>
                  )
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 px-6 rounded-2xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold text-base transition-all shadow-xl shadow-lime-400/20 flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="w-6 h-6 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Create Account &amp; Join Academy</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>

            <div className="text-center pt-2 text-sm text-muted">
              Already have an account?{' '}
              <button type="button" onClick={openLoginModal} className="text-lime-400 font-bold hover:underline">
                Log In
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
