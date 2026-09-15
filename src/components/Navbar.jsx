import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, Calendar, ChevronRight, LogOut, Menu, Moon, Palette, Shield, Sun, UserPlus, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { api } from '../lib/api'

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showThemeMenu, setShowThemeMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const { user, logout, openLoginModal, isAdmin, isCoach } = useAuth()
  const { theme, setTheme, themes, toggleTheme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()

  const navLinks = [
    { name: 'Home', path: '/' },
    ...(!user ? [{ name: 'Sign Up', path: '/signup' }] : []),
    { name: 'Schedule', path: '/schedule' },
    ...(user && user.role === 'player' ? [{ name: 'My Schedule', path: '/schedule?mine=1' }] : []),
    { name: 'Book a Session', path: '/book' },
  ]

  if (isAdmin || isCoach) {
    navLinks.push({ name: 'Dashboard', path: '/admin' })
  }

  useEffect(() => {
    if (!user) return
    api.get('/notifications').then(data => {
      setNotifications(data.notifications || [])
      setUnreadCount(data.unread || 0)
    }).catch(() => {})
  }, [user])

  useEffect(() => {
    if (!showNotifications) return
    const handleClick = (e) => {
      if (!e.target.closest('[data-notif-panel]')) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showNotifications])

  const isActive = (path) => {
    if (path === '/' && location.pathname === '/') return true
    if (path !== '/' && location.pathname.startsWith(path.split('?')[0])) return true
    return false
  }

  const handleLogout = () => {
    logout()
    setMobileMenuOpen(false)
    navigate('/')
  }

  const markAllRead = () => {
    api.put('/notifications/read-all').then(() => {
      setNotifications(n => n.map(x => ({ ...x, read: 1 })))
      setUnreadCount(0)
    }).catch(() => {})
  }

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-theme">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <Link to="/" className="flex items-center gap-3 group">
            <div                 className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-lime-400/80 shadow-lg shadow-lime-400/20 group-hover:scale-105 transition-transform bg-surface shrink-0">
              <img src={`${import.meta.env.BASE_URL}images/logo.jpg`} alt="MM Padel Academy Logo" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col">
              <span className="font-heading text-xl font-extrabold tracking-tight text-theme flex items-center gap-1.5">
                MM <span className="text-lime-400">PADEL</span> ACADEMY
              </span>
              <span className="text-[10px] uppercase font-bold text-muted tracking-widest -mt-1">
                Train &bull; Improve &bull; Compete
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1 bg-surface p-1.5 rounded-full border border-theme">
            {navLinks.map((link) => {
              const active = isActive(link.path)
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                    active
                      ? 'bg-lime-400 text-slate-950 shadow-md shadow-lime-400/20'
                      : 'text-theme hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/50'
                  }`}
                >
                  {link.name}
                </Link>
              )
            })}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowThemeMenu(!showThemeMenu)}
                className="p-2.5 rounded-xl bg-surface border border-theme text-muted hover:text-theme hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                title="Theme"
              >
                <Palette className="w-4 h-4" />
              </button>
              {showThemeMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-surface border border-theme rounded-xl shadow-2xl p-2 z-50">
                  {themes.map(t => (
                    <button
                      key={t.id}
                      onClick={() => { setTheme(t.id); setShowThemeMenu(false) }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-between ${
                        theme === t.id ? 'bg-lime-400/10 text-lime-400' : 'text-theme hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>{t.label}</span>
                      {theme === t.id && <span className="w-2 h-2 rounded-full bg-lime-400" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {user && (
              <div className="relative">
                <button onClick={() => setShowNotifications(!showNotifications)} className="relative p-2.5 rounded-xl bg-surface border border-theme text-muted hover:text-theme hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                {showNotifications && (
                  <div data-notif-panel className="absolute right-0 top-full mt-2 w-80 bg-surface border border-theme rounded-xl shadow-2xl z-50 max-h-96 overflow-y-auto">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-theme">
                      <span className="text-xs font-bold text-theme">Notifications</span>
                      {unreadCount > 0 && (
                        <button onClick={markAllRead} className="text-[10px] text-lime-400 font-semibold hover:underline">Mark all read</button>
                      )}
                    </div>
                    {notifications.length === 0 ? (
                      <p className="px-4 py-6 text-xs text-muted text-center">No notifications</p>
                    ) : (
                      notifications.slice(0, 10).map(n => (
                        <button
                          key={n.id}
                          onClick={() => {
                            if (!n.read) {
                              api.put(`/notifications/${n.id}/read`).then(() => {
                                setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: 1 } : x))
                                setUnreadCount(prev => Math.max(0, prev - 1))
                              }).catch(() => {})
                            }
                            if (n.link) {
                              setShowNotifications(false)
                              navigate(n.link)
                            }
                          }}
                          className={`w-full text-left px-4 py-3 border-b border-theme hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors ${!n.read ? 'bg-lime-400/5' : ''}`}
                        >
                          <p className="text-xs font-bold text-theme">{n.title}</p>
                          <p className="text-[11px] text-muted mt-0.5">{n.body}</p>
                          <p className="text-[10px] text-muted mt-1">{n.created_at?.slice(0, 16)}</p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {user ? (
              <div className="flex items-center gap-3 bg-surface pl-3 pr-2 py-1.5 rounded-full border border-theme">
                <Link to="/profile" className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-lime-400/20 text-lime-400 flex items-center justify-center font-bold text-xs border border-lime-400/40">
                    {user.name.charAt(0)}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-theme leading-tight">{user.name}</span>
                    <span className="text-[10px] text-lime-400 font-medium flex items-center gap-1">
                      {(user.role === 'superadmin' || user.role === 'admin' || user.role === 'coach') && (
                        <Shield className="w-3 h-3" />
                      )}
                      {user.role || 'Member'}
                    </span>
                  </div>
                </Link>
                <button
                  onClick={handleLogout}
                  title="Log Out"
                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-full transition-colors ml-1"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={openLoginModal}
                  className="px-4 py-2 text-sm font-semibold text-theme hover:text-theme hover:bg-slate-100 dark:hover:bg-slate-800/60 rounded-full transition-all"
                >
                  Log In
                </button>
                <Link
                  to="/book"
                  className="px-5 py-2.5 text-sm font-bold rounded-full bg-lime-400 hover:bg-lime-300 text-slate-950 transition-all shadow-lg shadow-lime-400/20 hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Book Session</span>
                </Link>
              </div>
            )}
          </div>

          <div className="md:hidden flex items-center gap-2">
            {user && (
              <div className="relative">
                <button className="relative p-2 rounded-xl bg-surface border border-theme text-theme">
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
              </div>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2.5 rounded-xl bg-surface border border-theme text-theme hover:text-theme focus:outline-none"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden bg-surface/95 border-b border-theme px-4 pt-3 pb-6 space-y-3 animate-fadeIn">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center justify-between px-4 py-3 rounded-xl text-base font-semibold transition-colors ${
                isActive(link.path)
                  ? 'bg-lime-400 text-slate-950 font-bold'
                  : 'text-theme hover:bg-slate-100 dark:hover:bg-slate-900'
              }`}
            >
              <span>{link.name}</span>
              <ChevronRight className="w-5 h-5 opacity-60" />
            </Link>
          ))}

          <div className="pt-4 border-t border-theme flex flex-col gap-2">
            <button
              onClick={toggleTheme}
              className="w-full py-3 rounded-xl bg-surface border border-theme text-theme font-semibold text-center text-sm flex items-center justify-center gap-2"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
            {user ? (
              <div className="p-4 rounded-xl bg-surface border border-theme flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-theme">{user.name}</p>
                  <p className="text-xs text-lime-400 flex items-center gap-1">
                    {(user.role === 'superadmin' || user.role === 'admin' || user.role === 'coach') && (
                      <Shield className="w-3 h-3" />
                    )}
                    {user.role || user.email}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 text-xs font-semibold text-rose-400 bg-rose-500/10 rounded-lg border border-rose-500/20"
                >
                  Log Out
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => {
                    openLoginModal()
                    setMobileMenuOpen(false)
                  }}
                  className="w-full py-3 rounded-xl bg-surface border border-theme text-theme font-semibold text-center text-sm"
                >
                  Log In
                </button>
                <Link
                  to="/signup"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full py-3 rounded-xl bg-lime-400 text-slate-950 font-bold text-center text-sm flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Create Account</span>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
