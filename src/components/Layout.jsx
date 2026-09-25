import { Outlet } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import Navbar from './Navbar'
import Footer from './Footer'
import LoginModal from './LoginModal'
import ScrollToTop from './ScrollToTop'

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-theme text-theme font-sans selection:bg-brand selection:text-white">
      <ScrollToTop />
      <Navbar />
      <LoginModal />
      <main className="flex-grow">
        <Outlet />
      </main>
      <Footer />
      <a
        href="https://wa.me/201000915244"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat on WhatsApp (+20 10 00915244)"
        className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-brand hover:bg-brand-hover text-white flex items-center justify-center shadow-xl shadow-brand/40 transition-all hover:scale-110 active:scale-95 animate-pulse-ring animate-rise"
      >
        <MessageCircle className="w-6 h-6" />
      </a>
    </div>
  )
}
