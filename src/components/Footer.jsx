import { Link } from 'react-router-dom'
import { ArrowUpRight, Clock, Globe, MapPin, MessageCircle, Phone, Share2 } from 'lucide-react'
import { CONTACT } from '../data/siteConfig'
import { useAuth } from '../context/AuthContext'

export default function Footer() {
  const mapsUrl = CONTACT.mapsUrl
  const { user } = useAuth()

  return (
    <footer className="bg-theme text-muted border-theme pt-16 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 pb-12 border-b border-theme">
          <div className="space-y-4">
            <Link to="/" className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-lime-400/80 shadow-lg shadow-lime-400/20 bg-surface shrink-0">
                <img src={`${import.meta.env.BASE_URL}images/logo.jpg`} alt="MM Padel Academy Logo" className="w-full h-full object-cover" />
              </div>
              <span className="font-heading text-lg font-extrabold text-theme">
                MM <span className="text-lime-400">PADEL</span> ACADEMY
              </span>
            </Link>
            <p className="text-sm text-muted leading-relaxed">
              Train. Improve. Compete. Professional padel coaching across 2 courts with a vibrant player community.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <span
                className="w-9 h-9 rounded-full bg-surface border border-theme flex items-center justify-center text-muted"
                title="Instagram"
              >
                <Globe className="w-4 h-4" />
              </span>
              <span
                className="w-9 h-9 rounded-full bg-surface border border-theme flex items-center justify-center text-muted"
                title="Facebook"
              >
                <Share2 className="w-4 h-4" />
              </span>
              <a
                href="https://wa.me/201000915244"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-surface border border-theme flex items-center justify-center text-muted hover:text-lime-400 hover:border-lime-400/50 transition-colors"
                title="WhatsApp Support (+20 10 00915244)"
              >
                <MessageCircle className="w-4 h-4" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="font-heading text-theme font-bold text-base mb-4 uppercase tracking-wider">
              Quick Links
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link to="/" className="hover:text-lime-400 transition-colors">Academy Overview</Link>
              </li>
              <li>
                <Link to="/schedule" className="hover:text-lime-400 transition-colors">Court Schedule (Day &amp; Week)</Link>
              </li>
              <li>
                <Link to="/book" className="hover:text-lime-400 transition-colors">Book Session</Link>
              </li>
              {!user && (
                <li>
                  <Link to="/signup" className="hover:text-lime-400 transition-colors">Join Academy Membership</Link>
                </li>
              )}
              {user && (
                <li>
                  <Link to="/profile" className="hover:text-lime-400 transition-colors">View Profile</Link>
                </li>
              )}
              <li>
                <Link to="/login" className="hover:text-lime-400 transition-colors">Member Login</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-heading text-theme font-bold text-base mb-4 uppercase tracking-wider">
              Contact Us &amp; Hours
            </h4>
            <ul className="space-y-3.5 text-sm">
              <li className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-lime-400 shrink-0 mt-0.5" />
                <span className="text-theme leading-snug">{CONTACT.address}</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-lime-400 shrink-0" />
                <a href={CONTACT.phoneHref} className="hover:text-lime-400 transition-colors font-bold text-theme">
                  {CONTACT.phone}
                </a>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-lime-400 shrink-0 mt-1" />
                <div>
                  <span className="text-theme font-bold block">{CONTACT.hours}</span>
                  <span className="text-xs text-muted">Weekly Academy Schedule</span>
                </div>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-heading text-theme font-bold text-base mb-4 uppercase tracking-wider">
              Sheikh Zayed Map
            </h4>
            <div className="relative rounded-2xl overflow-hidden border border-theme bg-surface group">
              <img
                src={`${import.meta.env.BASE_URL}images/court.png`}
                alt="Map preview"
                className="w-full h-32 object-cover opacity-60 group-hover:scale-105 transition-transform duration-500 bg-surface"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-50 dark:from-slate-950 via-slate-50/40 dark:via-slate-950/40 to-transparent flex flex-col justify-end p-3 space-y-1">
                <span className="text-[10px] text-lime-400 font-extrabold uppercase tracking-wider">
                  📍 El Sheikh Zayed, Giza
                </span>
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 px-3 bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-md"
                >
                  <span>Open in Google Maps</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-4 flex flex-col md:flex-row items-center justify-between text-xs text-muted gap-4">
          <p>© {new Date().getFullYear()} MM Padel Academy. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
            <span className="text-lime-400/80 font-mono text-[11px]">⚡ Sheikh Zayed, Giza</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
