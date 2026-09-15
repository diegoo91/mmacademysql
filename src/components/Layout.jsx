import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'
import Footer from './Footer'
import LoginModal from './LoginModal'

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-theme text-theme font-sans selection:bg-lime-400 selection:text-slate-950">
      <Navbar />
      <LoginModal />
      <main className="flex-grow">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
