import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import * as api from '../lib/api'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)

  useEffect(() => {
    api.initAuth().then(u => { setUser(u); setLoading(false) }).catch(() => setLoading(false))

    const handleLogout = () => { setUser(null); api.clearToken() }
    window.addEventListener('auth:logout', handleLogout)
    return () => window.removeEventListener('auth:logout', handleLogout)
  }, [])

  const login = useCallback(async (email, password) => {
    const u = await api.login(email, password)
    setUser(u)
    setIsLoginModalOpen(false)
    return u
  }, [])

  const signup = useCallback(async (userData) => {
    const u = await api.signup(userData)
    setUser(u)
    setIsLoginModalOpen(false)
    return u
  }, [])

  const logout = useCallback(async () => {
    await api.logout()
    setUser(null)
  }, [])

  const openLoginModal = () => setIsLoginModalOpen(true)
  const closeLoginModal = () => setIsLoginModalOpen(false)

  const hasRole = useCallback((...roles) => user && roles.includes(user.role), [user])
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin'
  const isCoach = user?.role === 'coach' || isAdmin
  const isSuperAdmin = user?.role === 'superadmin'
  const hasPermission = useCallback((module) => {
    if (!user) return false
    if (user.role === 'superadmin') return true
    return user.permissions?.includes(module) || false
  }, [user])

  return (
    <AuthContext.Provider
      value={{ user, setUser, loading, login, signup, logout, isLoginModalOpen, openLoginModal, closeLoginModal, hasRole, isAdmin, isCoach, isSuperAdmin, hasPermission }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
