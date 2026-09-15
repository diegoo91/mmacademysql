import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { api } from './lib/api'
import Layout from './components/Layout'
import Home from './pages/Home'
import SignUp from './pages/SignUp'
import Schedule from './pages/Schedule'
import Book from './pages/Book'
import Payment from './pages/Payment'
import Profile from './pages/Profile'
import Login from './pages/Login'
import AdminLayout from './pages/admin/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import Players from './pages/admin/Players'
import Results from './pages/admin/Results'
import Users from './pages/admin/Users'
import Imports from './pages/admin/Imports'
import Bookings from './pages/admin/Bookings'
import Comments from './pages/admin/Comments'
import ScheduleManager from './pages/admin/ScheduleManager'
import Expenses from './pages/admin/Expenses'
import Reports from './pages/admin/Reports'
import Payments from './pages/admin/Payments'

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen bg-theme flex items-center justify-center"><div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" /></div>
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

function ForcePasswordChange() {
  const { user, setUser, logout } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return }
    if (newPassword !== confirm) { setError('Passwords do not match'); return }
    setSaving(true)
    try {
      await api.post('/auth/force-change-password', { newPassword })
      setUser({ ...user, force_password_change: 0 })
    } catch (err) {
      setError(err.message || 'Failed to change password')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-4">
      <div className="w-full max-w-md glass-panel rounded-2xl border border-theme shadow-2xl p-8">
        <div className="text-center mb-6">
          <h2 className="font-heading text-2xl font-black text-theme">Set Your Password</h2>
          <p className="text-muted text-sm mt-2">You must set a new password before continuing. Your temporary password is no longer valid.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">New Password</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={8} required className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" placeholder="Min 8 characters" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">Confirm Password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} minLength={8} required className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400" />
          </div>
          {error && <p className="text-rose-400 text-xs text-center">{error}</p>}
          <button type="submit" disabled={saving} className="w-full py-3 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold text-sm transition-all disabled:opacity-50">
            {saving ? 'Saving...' : 'Set Password & Continue'}
          </button>
          <button type="button" onClick={logout} className="w-full py-2.5 rounded-xl bg-surface border border-theme text-theme text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-800">
            Log out instead
          </button>
        </form>
      </div>
    </div>
  )
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="min-h-screen bg-theme flex items-center justify-center"><div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" /></div>
  }

  if (user?.force_password_change) {
    return <ForcePasswordChange />
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/book" element={<Book />} />
        <Route path="/payment" element={<Payment />} />
        <Route path="/profile" element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        } />
        <Route path="/login" element={<Login />} />

        <Route path="/admin" element={
          <ProtectedRoute roles={['superadmin', 'admin', 'coach']}>
            <AdminLayout />
          </ProtectedRoute>
        }>
          <Route index element={
            <ProtectedRoute roles={['superadmin', 'admin']}>
              <Dashboard />
            </ProtectedRoute>
          } />
          <Route path="bookings" element={
            <ProtectedRoute roles={['superadmin', 'admin']}>
              <Bookings />
            </ProtectedRoute>
          } />
          <Route path="schedule" element={<ScheduleManager />} />
          <Route path="players" element={<Players />} />
          <Route path="results" element={
            <ProtectedRoute roles={['superadmin', 'admin']}>
              <Results />
            </ProtectedRoute>
          } />
          <Route path="users" element={
            <ProtectedRoute roles={['superadmin']}>
              <Users />
            </ProtectedRoute>
          } />
          <Route path="imports" element={
            <ProtectedRoute roles={['superadmin', 'admin']}>
              <Imports />
            </ProtectedRoute>
          } />
          <Route path="comments" element={
            <ProtectedRoute roles={['superadmin', 'admin']}>
              <Comments />
            </ProtectedRoute>
          } />
          <Route path="expenses" element={
            <ProtectedRoute roles={['superadmin', 'admin']}>
              <Expenses />
            </ProtectedRoute>
          } />
          <Route path="reports" element={
            <ProtectedRoute roles={['superadmin', 'admin']}>
              <Reports />
            </ProtectedRoute>
          } />
          <Route path="payments" element={
            <ProtectedRoute roles={['superadmin', 'admin']}>
              <Payments />
            </ProtectedRoute>
          } />
        </Route>

        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter basename={import.meta.env.PROD ? '/MMAcademy' : ''}>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
