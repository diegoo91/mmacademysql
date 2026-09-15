import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  MapPin,
  Medal,
  MessageSquare,
  Phone,
  Send,
  Sparkles,
  Star,
  Trophy,
  UserPlus,
  Users,
  HeartHandshake,
} from 'lucide-react'
import { ACADEMY_STATS, GALLERY_IMAGES, PROGRAMS, TESTIMONIALS } from '../data/homeShowcase'
import { CONTACT } from '../data/siteConfig'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const statIcons = [Trophy, Users, HeartHandshake, Medal]

export default function Home() {
  const [galleryFilter, setGalleryFilter] = useState('All')
  const { user } = useAuth()
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [commentRating, setCommentRating] = useState(5)
  const [commentLoading, setCommentLoading] = useState(false)
  const [commentMsg, setCommentMsg] = useState('')

  useEffect(() => {
    api.get('/comments').then(data => setComments(data || [])).catch(() => {})
  }, [])

  const filteredGallery =
    galleryFilter === 'All'
      ? GALLERY_IMAGES
      : GALLERY_IMAGES.filter((img) => img.category === galleryFilter)

  const mapsUrl = CONTACT.mapsUrl

  return (
    <div className="min-h-screen bg-theme text-theme overflow-hidden">
      {/* 1. HERO */}
      <section className="relative pt-12 pb-24 lg:pt-20 lg:pb-32 overflow-hidden border-b border-theme/60">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-lime-500/15 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute top-10 right-10 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface/90 border border-lime-400/40 text-lime-400 text-xs font-extrabold uppercase tracking-widest shadow-lg shadow-lime-400/10">
                <Flame className="w-4 h-4 fill-lime-400 text-lime-400 animate-pulse" />
                <span>Train &bull; Improve &bull; Compete</span>
              </div>

              <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-black text-theme leading-tight tracking-tight">
                ELEVATE YOUR GAME AT{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-lime-400 via-lime-300 to-emerald-400">
                  MM PADEL ACADEMY
                </span>
              </h1>

              <p className="text-lg sm:text-xl text-theme max-w-2xl font-normal leading-relaxed mx-auto lg:mx-0">
                Professional padel coaching across our 2 dedicated courts &mdash; private coaching and group
                classes, 1-hour sessions, Sunday to Thursday, 3:00 PM to 11:00 PM.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-4">
                <Link
                  to="/book"
                  className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold text-base transition-all shadow-xl shadow-lime-400/25 flex items-center justify-center gap-3 hover:scale-105 active:scale-95"
                >
                  <Calendar className="w-5 h-5 stroke-[2.5]" />
                  <span>Book Training Package</span>
                  <ArrowRight className="w-5 h-5" />
                </Link>

                <Link
                  to={user ? '/profile' : '/book'}
                  className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-surface hover:bg-slate-100 dark:hover:bg-slate-800 text-theme font-extrabold text-base border border-theme transition-all flex items-center justify-center gap-3 hover:border-lime-400/50"
                >
                  <UserPlus className="w-5 h-5 text-lime-400" />
                  <span>{user ? 'View Profile' : 'Join Academy'}</span>
                </Link>
              </div>

              <div className="pt-6 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-xs text-muted font-medium">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-lime-400" />
                  <span>Sun &ndash; Thu (3 PM &ndash; 11 PM)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-lime-400" />
                  <span>1 Hour Sessions</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-lime-400" />
                  <span>InstaPay Instant Transfer</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 relative">
              <div className="relative rounded-3xl overflow-hidden border border-theme shadow-2xl group bg-surface">
                <img
                  src={`${import.meta.env.BASE_URL}images/hero.png`}
                  alt="MM Padel Academy Court"
                  className="w-full h-[300px] sm:h-[420px] object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />

                <div className="absolute bottom-6 left-6 right-6 p-4 rounded-2xl glass-panel border border-theme/60 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-lime-400 uppercase tracking-wider">
                      Private &amp; Group Packages
                    </span>
                    <p className="text-theme font-extrabold text-sm mt-0.5">From 500 EGP / session</p>
                  </div>
                  <Link
                    to="/book"
                    className="px-3.5 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold text-xs shadow-md transition-all"
                  >
                    View Packages
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4">
            {ACADEMY_STATS.map((stat, idx) => {
              const Icon = statIcons[idx % statIcons.length]
              return (
                <div key={idx} className="p-6 rounded-2xl glass-card text-center flex flex-col items-center justify-center">
                  <div className="w-10 h-10 mb-3 rounded-xl bg-lime-400/10 text-lime-400 flex items-center justify-center font-bold">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="font-heading text-3xl font-black text-theme">{stat.value}</div>
                  <div className="text-xs font-semibold text-muted mt-1 uppercase tracking-wider">{stat.label}</div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* 2. PRICING FLYER SHOWCASE */}
      <section className="py-20 bg-slate-100/40 dark:bg-slate-900/40 relative border-b border-theme/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-5 relative flex justify-center">
              <div className="relative rounded-3xl overflow-hidden border-2 border-lime-400/50 shadow-2xl max-w-sm group">
                <img
                  src={`${import.meta.env.BASE_URL}images/pricing.jpg`}
                  alt="Official MM Padel Academy Pricing Flyer"
                  className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                  <span className="text-xs font-bold text-lime-400 bg-slate-950/90 px-3 py-1.5 rounded-full border border-lime-400/40">
                    Official Package Rates
                  </span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-lime-400">
                <Sparkles className="w-4 h-4" />
                <span>Official Academy Rates</span>
              </div>

              <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-theme leading-tight">
                Transparent Package Pricing Designed for Every Player
              </h2>

              <p className="text-theme text-base leading-relaxed">
                All training sessions are <strong>1 Hour</strong> in duration and priced{' '}
                <strong>per player</strong>. Training days run weekly from{' '}
                <strong>Sunday to Thursday (3:00 PM &ndash; 11:00 PM)</strong>.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="p-5 rounded-2xl bg-surface border border-theme space-y-3">
                  <div className="flex justify-between items-center border-b border-theme pb-2">
                    <h4 className="font-heading font-extrabold text-theme text-base">Private Coaching</h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-lime-400/20 text-lime-400">1-on-1</span>
                  </div>
                  <ul className="space-y-2 text-xs">
                    <li className="flex justify-between text-theme">
                      <span>1 Session:</span>
                      <strong className="text-theme">1,000 EGP</strong>
                    </li>
                    <li className="flex justify-between text-theme">
                      <span>4 Sessions:</span>
                      <strong className="text-lime-400">3,600 EGP</strong>
                    </li>
                    <li className="flex justify-between text-theme">
                      <span>8 Sessions:</span>
                      <strong className="text-lime-400 font-extrabold">7,000 EGP</strong>
                    </li>
                    <li className="flex justify-between text-theme">
                      <span>12 Sessions:</span>
                      <strong className="text-lime-400">10,800 EGP</strong>
                    </li>
                    <li className="flex justify-between text-theme">
                      <span>16 Sessions:</span>
                      <strong className="text-lime-400 font-extrabold">14,000 EGP</strong>
                    </li>
                  </ul>
                </div>

                <div className="p-5 rounded-2xl bg-surface border border-theme space-y-3">
                  <div className="flex justify-between items-center border-b border-theme pb-2">
                    <h4 className="font-heading font-extrabold text-theme text-base">Group (2 Persons)</h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-600 dark:text-purple-300">Group</span>
                  </div>
                  <ul className="space-y-2 text-xs">
                    <li className="flex justify-between text-theme">
                      <span>1 Session:</span>
                      <strong className="text-theme">500 EGP</strong>
                    </li>
                    <li className="flex justify-between text-theme">
                      <span>4 Sessions:</span>
                      <strong className="text-lime-400">1,800 EGP</strong>
                    </li>
                    <li className="flex justify-between text-theme">
                      <span>8 Sessions:</span>
                      <strong className="text-lime-400 font-extrabold">3,500 EGP</strong>
                    </li>
                    <li className="flex justify-between text-theme">
                      <span>16 Sessions:</span>
                      <strong className="text-lime-400 font-extrabold">7,000 EGP</strong>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="pt-4">
                <Link
                  to="/book"
                  className="px-8 py-3.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold text-sm transition-all shadow-lg shadow-lime-400/20 inline-flex items-center gap-2"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Book Your Package Now</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. PROGRAMS */}
      <section id="coaches" className="py-20 relative border-b border-theme/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
            <span className="text-xs font-extrabold uppercase tracking-widest text-lime-400">
              Training Programs
            </span>
            <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-theme">
              Tailored Programs for Every Level
            </h2>
            <p className="text-muted text-base">
              Private coaching or group classes &mdash; pick the path that fits your game.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {PROGRAMS.map((program) => (
              <div key={program.id} className="glass-card rounded-2xl overflow-hidden flex flex-col justify-between group bg-surface/60 dark:bg-slate-900/60">
                <div>
                  <div className="relative h-48 overflow-hidden bg-surface border-theme">
                    <img
                      src={program.image}
                      alt={program.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-slate-950/80 backdrop-blur-md border border-slate-700 text-xs font-bold text-lime-400">
                      {program.level}
                    </div>
                    <div className="absolute bottom-3 right-3 px-3 py-1 rounded-full bg-lime-400 text-slate-950 font-extrabold text-xs">
                      {program.priceText}
                    </div>
                  </div>

                  <div className="p-5 space-y-3">
                    <h3 className="font-heading font-extrabold text-lg text-theme group-hover:text-lime-400 transition-colors">
                      {program.title}
                    </h3>
                    <p className="text-xs text-muted line-clamp-2 leading-relaxed">{program.description}</p>

                    <div className="p-2.5 rounded-xl bg-surface border border-theme text-[11px] text-lime-400 font-semibold">
                      {program.packages}
                    </div>

                    <ul className="space-y-2 pt-2 border-t border-theme/80">
                      {program.features.map((feat, fIdx) => (
                        <li key={fIdx} className="text-xs text-theme flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-lime-400 shrink-0" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="p-5 pt-0">
                  <Link
                    to="/book"
                    className="w-full py-2.5 rounded-xl bg-surface hover:bg-lime-400 hover:text-slate-950 text-theme font-bold text-xs transition-all border border-theme hover:border-lime-400 flex items-center justify-center gap-2"
                  >
                    <span>Book This Program</span>
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. GALLERY */}
      <section id="gallery" className="py-20 bg-slate-100/30 dark:bg-slate-900/30 border-b border-theme/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-widest text-lime-400">
                Court Showcase &amp; Facilities
              </span>
              <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-theme mt-1">
                Explore the Academy
              </h2>
            </div>

            <div className="flex flex-wrap gap-2">
              {['All', 'Courts', 'Night Play', 'Training', 'Facilities'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setGalleryFilter(cat)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    galleryFilter === cat
                      ? 'bg-lime-400 text-slate-950 shadow-md shadow-lime-400/20'
                      : 'bg-surface text-theme hover:bg-slate-100 dark:hover:bg-slate-800 border border-theme'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGallery.map((item) => (
              <div key={item.id} className="relative rounded-2xl overflow-hidden h-72 border border-theme group bg-surface">
                <img
                  src={item.image}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent opacity-90" />
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                  <div>
                    <span className="px-2.5 py-1 rounded-md bg-lime-400/20 border border-lime-400/40 text-lime-400 text-[10px] font-extrabold uppercase tracking-wider">
                      {item.tag}
                    </span>
                    <h4 className="font-heading font-extrabold text-white text-lg mt-1">{item.title}</h4>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. TESTIMONIALS */}
      <section className="py-20 relative border-b border-theme/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto space-y-3 mb-14">
            <span className="text-xs font-extrabold uppercase tracking-widest text-lime-400">
              Community Testimonials
            </span>
            <h2 className="font-heading text-3xl font-extrabold text-theme">Loved by Players of All Levels</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {TESTIMONIALS.map((t) => (
              <div key={t.id} className="glass-card rounded-2xl p-6 space-y-4 relative bg-surface/60 dark:bg-slate-900/60">
                <div className="flex items-center gap-1 text-amber-400">
                  {[...Array(t.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-theme leading-relaxed italic">&quot;{t.text}&quot;</p>
                <div className="flex items-center gap-3 pt-3 border-t border-theme">
                  <img src={t.avatar} alt={t.name} className="w-10 h-10 rounded-full object-cover border border-theme bg-surface border-theme" />
                  <div>
                    <h5 className="font-bold text-theme text-sm">{t.name}</h5>
                    <span className="text-xs text-lime-400">{t.level}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. PLAYER REVIEWS */}
      <section className="py-20 bg-slate-100/40 dark:bg-slate-900/40 border-b border-theme/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto space-y-3 mb-14">
            <span className="text-xs font-extrabold uppercase tracking-widest text-lime-400">Player Reviews</span>
            <h2 className="font-heading text-3xl font-extrabold text-theme">What Our Players Say</h2>
          </div>

          {user && (
            <div className="max-w-xl mx-auto mb-10 glass-panel rounded-2xl border border-theme p-5 space-y-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-lime-400" />
                <span className="text-sm font-bold text-theme">Leave a Comment</span>
              </div>
              <div className="flex items-center gap-1">
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={() => setCommentRating(n)} type="button">
                    <Star className={`w-5 h-5 ${n <= commentRating ? 'fill-amber-400 text-amber-400' : 'text-muted'}`} />
                  </button>
                ))}
              </div>
              <textarea value={commentText} onChange={e => setCommentText(e.target.value)} rows={3} placeholder="Share your experience at MM Padel Academy..." className="w-full px-4 py-3 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-lime-400 resize-none" />
              {commentMsg && <p className={`text-xs ${commentMsg.includes('Thank') ? 'text-emerald-400' : 'text-rose-400'}`}>{commentMsg}</p>}
              <button onClick={async () => {
                if (!commentText.trim()) return
                setCommentLoading(true)
                try {
                  await api.post('/comments', { text: commentText, rating: commentRating })
                  setCommentText('')
                  setCommentRating(5)
                  setCommentMsg('Thank you! Your comment is pending admin review.')
                } catch (err) {
                  setCommentMsg(err.message || 'Failed to submit comment')
                }
                setCommentLoading(false)
              }} disabled={commentLoading || !commentText.trim()} className="px-5 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all disabled:opacity-50">
                <Send className="w-3.5 h-3.5" />
                {commentLoading ? 'Submitting...' : 'Submit for Review'}
              </button>
            </div>
          )}

          {!user && (
            <p className="text-center text-muted text-sm mb-8">Sign in to leave a review.</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {comments.length > 0 ? comments.slice(0, 6).map((c) => (
              <div key={c.id} className="glass-card rounded-2xl p-6 space-y-3 bg-surface/60 dark:bg-slate-900/60">
                <div className="flex items-center gap-1 text-amber-400">
                  {[...Array(c.rating || 5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-theme leading-relaxed italic">&quot;{c.text}&quot;</p>
                <div className="flex items-center gap-3 pt-3 border-t border-theme">
                  <div className="w-9 h-9 rounded-full bg-lime-400/20 text-lime-400 flex items-center justify-center font-bold text-xs border border-lime-400/40">
                    {(c.user_name || 'U').charAt(0)}
                  </div>
                  <div>
                    <h5 className="font-bold text-theme text-sm">{c.user_name}</h5>
                  </div>
                </div>
              </div>
            )) : TESTIMONIALS.map((t) => (
              <div key={t.id} className="glass-card rounded-2xl p-6 space-y-4 relative bg-surface/60 dark:bg-slate-900/60">
                <div className="flex items-center gap-1 text-amber-400">
                  {[...Array(t.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-theme leading-relaxed italic">&quot;{t.text}&quot;</p>
                <div className="flex items-center gap-3 pt-3 border-t border-theme">
                  <img src={t.avatar} alt={t.name} className="w-10 h-10 rounded-full object-cover border border-theme bg-surface border-theme" />
                  <div>
                    <h5 className="font-bold text-theme text-sm">{t.name}</h5>
                    <span className="text-xs text-lime-400">{t.level}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. CONTACT */}
      <section className="py-20 bg-slate-100/40 dark:bg-slate-900/40 border-b border-theme/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto space-y-3 mb-12">
            <span className="text-xs font-extrabold uppercase tracking-widest text-lime-400">Find Us</span>
            <h2 className="font-heading text-3xl font-extrabold text-theme">Contact the Academy</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <a href={CONTACT.phoneHref} className="glass-card rounded-2xl p-6 flex items-start gap-4 hover:border-lime-400/40">
              <span className="p-3 rounded-xl bg-lime-400/10 text-lime-400 border border-lime-400/30">
                <Phone className="w-5 h-5" />
              </span>
              <span>
                <span className="block text-xs uppercase tracking-wider text-muted font-bold">Phone / WhatsApp</span>
                <span className="block text-theme font-extrabold mt-1">{CONTACT.phone}</span>
              </span>
            </a>
            <div className="glass-card rounded-2xl p-6 flex items-start gap-4">
              <span className="p-3 rounded-xl bg-lime-400/10 text-lime-400 border border-lime-400/30">
                <Clock className="w-5 h-5" />
              </span>
              <span>
                <span className="block text-xs uppercase tracking-wider text-muted font-bold">Hours</span>
                <span className="block text-theme font-extrabold mt-1">{CONTACT.hours}</span>
              </span>
            </div>
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="glass-card rounded-2xl p-6 flex items-start gap-4 hover:border-lime-400/40">
              <span className="p-3 rounded-xl bg-lime-400/10 text-lime-400 border border-lime-400/30">
                <MapPin className="w-5 h-5" />
              </span>
              <span>
                <span className="block text-xs uppercase tracking-wider text-muted font-bold">Location</span>
                <span className="block text-theme text-sm mt-1 leading-relaxed">{CONTACT.address}</span>
                <span className="block text-lime-400 text-xs font-bold mt-2">Open in Google Maps &rarr;</span>
              </span>
            </a>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-gradient-to-r from-lime-500/20 via-emerald-500/10 to-slate-100 dark:to-slate-900 border-t border-theme">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-theme">Ready to Step Onto the Court?</h2>
          <p className="text-theme max-w-xl mx-auto text-base">
            Book your package online in seconds or register for academy training today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <Link
              to="/book"
              className="px-8 py-3.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold text-sm transition-all shadow-lg shadow-lime-400/20 flex items-center gap-2"
            >
              <Calendar className="w-4 h-4" />
              <span>Book a Session Now</span>
            </Link>
            {!user ? (
              <Link
                to="/signup"
                className="px-8 py-3.5 rounded-xl bg-surface hover:bg-slate-100 dark:hover:bg-slate-800 text-theme font-bold text-sm border border-theme transition-all"
              >
                <span>Create Free Account</span>
              </Link>
            ) : (
              <Link
                to="/profile"
                className="px-8 py-3.5 rounded-xl bg-surface hover:bg-slate-100 dark:hover:bg-slate-800 text-theme font-bold text-sm border border-theme transition-all"
              >
                <span>View My Profile</span>
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
