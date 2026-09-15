import { useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, ChevronLeft, ClipboardList, DollarSign, FileUp, LayoutDashboard, LogOut, Menu, MessageSquare, PieChart, Shield, Users, UserX, X, CalendarClock } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

const ALL_SIDEBAR_LINKS = [
  { name: 'Dashboard', path: '/admin', icon: LayoutDashboard, exact: true, roles: ['superadmin', 'admin'] },
  { name: 'Bookings', path: '/admin/bookings', icon: ClipboardList, roles: ['superadmin', 'admin'] },
  { name: 'Schedule Manager', path: '/admin/schedule', icon: CalendarClock, roles: ['superadmin', 'admin', 'coach'] },
  { name: 'Players', path: '/admin/players', icon: Users, roles: ['superadmin', 'admin', 'coach'] },
  { name: 'Results', path: '/admin/results', icon: BarChart3, roles: ['superadmin', 'admin'] },
  { name: 'Users', path: '/admin/users', icon: UserX, roles: ['superadmin'] },
  { name: 'Imports', path: '/admin/imports', icon: FileUp, roles: ['superadmin', 'admin'] },
  { name: 'Comments', path: '/admin/comments', icon: MessageSquare, roles: ['superadmin', 'admin'] },
  { name: 'Expenses', path: '/admin/expenses', icon: DollarSign, roles: ['superadmin', 'admin'] },
  { name: 'Payments', path: '/admin/payments', icon: DollarSign, roles: ['superadmin', 'admin'] },
  { name: 'Reports', path: '/admin/reports', icon: PieChart, roles: ['superadmin', 'admin'] },
]

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const sidebarLinks = ALL_SIDEBAR_LINKS.filter(l => l.roles.includes(user?.role))

  const isActive = (path, exact) => exact ? location.pathname === path : location.pathname.startsWith(path)

  const handleLogout = () => { logout(); navigate('/') }

  const sidebarContent = (collapsed) => (
    <>
      <div className="p-4 flex items-center justify-between border-b border-theme">
        {(!collapsed || mobileOpen) && (
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-lime-400" />
            <span className="font-bold text-theme text-sm">
              {user?.role === 'coach' ? 'Coach Panel' : 'Admin Panel'}
            </span>
          </div>
        )}
        <button onClick={() => mobileOpen ? setMobileOpen(false) : setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-muted hover:text-slate-900 dark:hover:text-white transition-colors">
          {mobileOpen ? <X className="w-4 h-4" /> : <ChevronLeft className={`w-4 h-4 transition-transform ${!sidebarOpen ? 'rotate-180' : ''}`} />}
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {sidebarLinks.map(link => {
          const active = isActive(link.path, link.exact)
          const Icon = link.icon
          return (
            <Link
              key={link.path}
              to={link.path}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                active
                  ? 'bg-lime-400/10 text-lime-400 border border-lime-400/20'
                  : 'text-muted hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
              }`}
              title={collapsed ? link.name : undefined}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {(!collapsed || mobileOpen) && <span>{link.name}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-theme">
        <Link
          to="/"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-muted hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-all"
        >
          <ChevronLeft className="w-5 h-5 shrink-0" />
          {(!collapsed || mobileOpen) && <span>Back to Site</span>}
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-rose-400 hover:bg-rose-500/10 transition-all mt-1"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {(!collapsed || mobileOpen) && <span>Log Out</span>}
        </button>
      </div>
    </>
  )

  return (
    <div className="flex min-h-[calc(100vh-5rem)] bg-theme relative">
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} hidden md:flex flex-col bg-surface/50 border-r border-theme transition-all duration-300 shrink-0`}>
        {sidebarContent(!sidebarOpen)}
      </aside>

      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-sm md:hidden" onClick={() => setMobileOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-surface border-r border-theme md:hidden animate-fadeIn">
            {sidebarContent(false)}
          </aside>
        </>
      )}

      <main className="flex-1 p-4 md:p-8 overflow-auto min-w-0">
        <div className="md:hidden flex items-center gap-2 mb-6">
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-lg bg-surface border border-theme text-theme">
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold text-theme">{user?.role === 'coach' ? 'Coach Panel' : 'Admin Panel'}</span>
        </div>
        <Outlet />
      </main>
    </div>
  )
}
