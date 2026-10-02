import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  HelpCircle,
  MapPin,
  Maximize2,
  Medal,
  MessageSquare,
  Phone,
  Send,
  Sparkles,
  Star,
  Target,
  Trophy,
  Users,
  HeartHandshake,
  X,
} from 'lucide-react'
import {
  ACADEMY_STATS,
  FAQS,
  GALLERY_IMAGES,
  HERO_POSTER,
  HERO_VIDEO,
  METHOD_STEPS,
  WHY_MM,
} from '../data/homeShowcase'
import { CONTACT, COURTS } from '../data/siteConfig'
import { PRICING } from '../data/pricingData'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import Reveal from '../components/Reveal'

const statIcons = [Trophy, Users, HeartHandshake, Medal]

function useCountUp(target, duration = 1200) {
  const [value, setValue] = useState(0)
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setValue(target)
      return
    }
    let frame
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        io.disconnect()
        const start = performance.now()
        const tick = (now) => {
          const p = Math.min((now - start) / duration, 1)
          setValue(Math.round(target * (1 - Math.pow(1 - p, 3))))
          if (p < 1) frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
      },
      { threshold: 0.4 }
    )
    io.observe(el)
    return () => {
      io.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [target, duration])

  return { ref, value }
}

const whyIcons = [Target, Sparkles, Users]

const HOME_TOPICS = [
  { id: 'hero', label: 'Home' },
  { id: 'method', label: 'Method' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'faq', label: 'FAQ' },
  { id: 'contact', label: 'Contact' },
]

function PricingTierCard({ type, badge, badgeClass, delay, featured }) {
  const tier = PRICING[type]
  const counts = Object.keys(tier)
    .filter((k) => k !== 'name')
    .map(Number)
    .sort((a, b) => a - b)
  const bestRate = Math.min(...counts.map((c) => tier[c] / c))

  return (
    <Reveal
      delay={delay}
      className={`p-5 rounded-2xl bg-surface border space-y-3 transition-shadow ${
        featured ? 'border-gold/60 ring-2 ring-gold/45 shadow-lg shadow-gold/10' : 'border-theme'
      }`}
    >
      <div className="flex justify-between items-center border-b border-theme pb-2">
        <h4 className="font-heading font-extrabold text-theme text-base">{tier.name}</h4>
        {featured ? (
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-950 bg-gold px-2 py-0.5 rounded">Best Value</span>
        ) : (
          <span className={badgeClass}>{badge}</span>
        )}
      </div>
      <ul className="space-y-2 text-xs">
        {counts.map((count) => {
          const rate = tier[count] / count
          const best = Math.abs(rate - bestRate) < 0.01
          return (
            <li
              key={count}
              className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 -mx-2 transition-colors ${
                best ? 'bg-gold/10 ring-1 ring-gold/45' : ''
              }`}
            >
              <span className="text-theme font-semibold">
                {count} Session{count > 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-2">
                {best && (
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-950 bg-gold px-1.5 py-0.5 rounded">
                    Best
                  </span>
                )}
                <span className="text-right leading-tight">
                  <strong className={`block ${count === 1 ? 'text-theme' : 'text-brand-text font-extrabold'}`}>
                    {tier[count].toLocaleString()} EGP
                  </strong>
                  {count > 1 && (
                    <span className="block text-[10px] text-muted font-semibold">
                      ≈ {Math.round(rate).toLocaleString('en-US')} EGP / session
                    </span>
                  )}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </Reveal>
  )
}

export default function Home() {
  const { user } = useAuth()
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [commentRating, setCommentRating] = useState(5)
  const [commentLoading, setCommentLoading] = useState(false)
  const [commentMsg, setCommentMsg] = useState('')
  const [openFaq, setOpenFaq] = useState(null)
  const [showAllReviews, setShowAllReviews] = useState(false)
  const [topicIndex, setTopicIndex] = useState(0)
  const [lightIdx, setLightIdx] = useState(null)
  const [navNearFooter, setNavNearFooter] = useState(false)

  const courtsCount = useCountUp(COURTS, 1000)
  const sessionCount = useCountUp(1, 900)

  const toggleFaq = useCallback((i) => {
    setOpenFaq((prev) => (prev === i ? null : i))
  }, [])

  useEffect(() => {
    api.get('/comments').then(data => setComments(data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    const onScroll = () => {
      const probe = window.scrollY + window.innerHeight * 0.35
      let idx = 0
      HOME_TOPICS.forEach((topic, i) => {
        const el = document.getElementById(topic.id)
        if (el && el.offsetTop <= probe) idx = i
      })
      setTopicIndex(idx)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollToTopic = useCallback((nextIdx) => {
    const max = HOME_TOPICS.length - 1
    const clamped = Math.min(Math.max(nextIdx, 0), max)
    const el = document.getElementById(HOME_TOPICS[clamped].id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setTopicIndex(clamped)
  }, [])

  useEffect(() => {
    const footer = document.querySelector('footer')
    if (!footer || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([entry]) => setNavNearFooter(entry.isIntersecting),
      { threshold: 0 }
    )
    io.observe(footer)
    return () => io.disconnect()
  }, [])

  // Auto-scroll: guided tour on load (one section per tick), then resumes only
  // after 10s of no user input. Any wheel/touch/key/click pauses it.
  const lastInteractionRef = useRef(null) // null = tour mode (never interacted)
  useEffect(() => {
    const AUTO_TICK = 4500
    const IDLE_RESUME = 10000
    const markInteraction = () => { lastInteractionRef.current = Date.now() }
    const events = ['wheel', 'touchstart', 'keydown', 'mousedown']
    events.forEach((ev) => window.addEventListener(ev, markInteraction, { passive: true }))

    const timer = setInterval(() => {
      if (document.hidden || lightIdx !== null || navNearFooter) return
      const last = lastInteractionRef.current
      const inTour = last === null
      const idle = last !== null && Date.now() - last >= IDLE_RESUME
      if (!inTour && !idle) return
      if (topicIndex >= HOME_TOPICS.length - 1) return
      scrollToTopic(topicIndex + 1)
    }, AUTO_TICK)

    return () => {
      clearInterval(timer)
      events.forEach((ev) => window.removeEventListener(ev, markInteraction))
    }
  }, [topicIndex, lightIdx, navNearFooter, scrollToTopic])

  useEffect(() => {
    if (lightIdx === null) return
    const total = GALLERY_IMAGES.length
    const onKey = (e) => {
      if (e.key === 'Escape') setLightIdx(null)
      else if (e.key === 'ArrowRight') setLightIdx((i) => (i === null ? i : (i + 1) % total))
      else if (e.key === 'ArrowLeft') setLightIdx((i) => (i === null ? i : (i - 1 + total) % total))
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [lightIdx])

  const mapsUrl = CONTACT.mapsUrl
  const bestRateOfType = (type) => {
    const t = PRICING[type]
    return Math.min(...Object.keys(t).filter((k) => k !== 'name').map(Number).map((c) => t[c] / c))
  }
  const featuredType = bestRateOfType('private') <= bestRateOfType('group') ? 'private' : 'group'

  return (
    <div className="min-h-screen bg-theme text-theme overflow-hidden">
      {/* 1. HERO — centered Image-2 style, faded + catchy */}
      <section
        id="hero"
        className="relative py-28 lg:py-36 overflow-hidden border-b border-white/10 bg-[linear-gradient(165deg,#3D8B76_0%,#2A6B5C_42%,#1F5246_100%)] text-white"
      >
        <video
          src={HERO_VIDEO}
          poster={HERO_POSTER}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          className="hero-video absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/55 to-slate-950/65 pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(255,255,255,0.18),transparent_60%)] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_60%_at_50%_100%,rgba(13,27,24,0.45),transparent_55%)] pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-black/25 pointer-events-none" />

        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center space-y-8">
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full border border-white/25 bg-white/10 backdrop-blur-sm text-[11px] sm:text-xs font-extrabold uppercase tracking-[0.3em] text-white/75 animate-rise">
            <Medal className="w-3.5 h-3.5 text-gold" />
            <span>Train &bull; Improve &bull; Compete</span>
          </div>

          <h1
            className="font-serif-display text-4xl sm:text-5xl lg:text-6xl font-medium leading-[1.12] tracking-tight animate-rise"
            style={{ animationDelay: '80ms' }}
          >
            <span className="block text-white">Get ready for</span>
            <span className="block text-transparent bg-clip-text bg-[linear-gradient(100deg,#FFFFFF_0%,#E8FFF5_35%,#4FD1A5_70%,#FFFFFF_100%)]">
              your new level
            </span>
          </h1>

          <p
            className="text-base sm:text-lg text-white/75 max-w-2xl mx-auto leading-relaxed animate-rise"
            style={{ animationDelay: '160ms' }}
          >
            Professional padel coaching across our {COURTS} dedicated courts &mdash; private coaching and
            group classes, 1-hour sessions, Sunday to Thursday, 3:00 PM to 11:00 PM.
          </p>

          <div
            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2 animate-rise"
            style={{ animationDelay: '240ms' }}
          >
            <Link
              to="/book"
              className="w-full sm:w-auto px-9 py-4 rounded-full bg-gold hover:bg-gold-hover text-slate-950 font-extrabold text-base transition-all shadow-[0_0_28px_rgba(196,154,69,0.45)] flex items-center justify-center gap-3 active:scale-95"
            >
              <Calendar className="w-5 h-5 stroke-[2.5]" />
              <span>Book a session</span>
            </Link>

            <a
              href="#pricing"
              className="w-full sm:w-auto px-9 py-4 rounded-full border border-white/40 bg-white/5 backdrop-blur-sm text-white/90 font-extrabold text-base transition-all flex items-center justify-center gap-3 hover:bg-white/15 hover:border-white/70 hover:text-white"
            >
              <span>See pricing</span>
              <ArrowRight className="w-5 h-5" />
            </a>
          </div>

          <div className="pt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            {ACADEMY_STATS.map((stat, idx) => {
              const Icon = statIcons[idx % statIcons.length]
              const counter =
                idx === 0 ? courtsCount : idx === 1 ? sessionCount : null
              return (
                <Reveal
                  key={idx}
                  delay={idx * 100}
                  className="p-5 rounded-2xl bg-white/[0.07] border border-white/10 backdrop-blur-md text-center flex flex-col items-center justify-center hover:bg-white/[0.12] hover:border-white/20 transition-colors"
                >
                  <div className="w-9 h-9 mb-2.5 rounded-xl bg-white/10 text-white/80 flex items-center justify-center font-bold">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div ref={counter ? counter.ref : undefined} className="font-heading text-2xl sm:text-3xl font-black text-white/90">
                    {counter ? `${counter.value}${idx === 0 ? ' Courts' : ' Hour'}` : stat.value}
                  </div>
                  <div className="text-[10px] font-semibold text-white/45 mt-1 uppercase tracking-wider">
                    {stat.label}
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* METHOD + WHY MM (merged) */}
      <section id="method" className="py-20 border-b border-theme/60 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center max-w-3xl mx-auto space-y-3 mb-14">
            <span className="text-xs font-extrabold uppercase tracking-widest text-brand-text">
              Why MM Padel Academy
            </span>
            <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-theme">
              Train. Improve. Compete.
            </h2>
            <p className="text-muted text-base">
              A simple, proven path every player follows &mdash; and why players choose MM.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14">
            {METHOD_STEPS.map((step, i) => (
              <Reveal key={step.n} delay={i * 120} className="glass-card rounded-2xl p-7 relative overflow-hidden group transition-transform hover:-translate-y-1">
                <span className="font-heading text-6xl font-black text-brand/10 dark:text-brand/20 absolute -top-3 -right-2 select-none group-hover:text-brand/20 transition-colors">
                  {step.n}
                </span>
                <div className="relative">
                  <div className="w-11 h-11 rounded-xl bg-brand text-white flex items-center justify-center font-extrabold font-heading text-sm mb-4 shadow-lg shadow-brand/25">
                    {step.n}
                  </div>
                  <h3 className="font-heading font-extrabold text-xl text-theme mb-2 group-hover:text-brand-text transition-colors">
                    {step.title}
                  </h3>
                  <p className="text-sm text-muted leading-relaxed">{step.description}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {WHY_MM.map((item, i) => {
              const Icon = whyIcons[i]
              return (
                <Reveal key={item.title} delay={i * 110} className="glass-card rounded-2xl p-6 group transition-transform hover:-translate-y-1">
                  <span className="inline-flex p-3 rounded-xl bg-brand/10 text-brand-text border border-brand-text/30 mb-4">
                    <Icon className="w-5 h-5" />
                  </span>
                  <h3 className="font-heading font-extrabold text-lg text-theme mb-2 group-hover:text-brand-text transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted leading-relaxed">{item.description}</p>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* 2. PRICING FLYER SHOWCASE */}
      <section id="pricing" className="py-20 bg-slate-100/40 dark:bg-slate-900/40 relative border-b border-theme/60 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <Reveal className="lg:col-span-5 relative flex justify-center">
              <div className="relative rounded-3xl overflow-hidden border-2 border-brand-text/50 shadow-2xl max-w-sm group tilt-hover">
                <img
                  src={`${import.meta.env.BASE_URL}images/pricing.jpg`}
                  alt="Official MM Padel Academy Pricing Flyer"
                  className="w-full h-auto object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                  <span className="text-xs font-bold text-brand-text bg-slate-950/90 px-3 py-1.5 rounded-full border border-brand-text/40">
                    Official Package Rates
                  </span>
                </div>
              </div>
            </Reveal>

            <div className="lg:col-span-7 space-y-6">
              <Reveal>
                <div className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-brand-text">
                  <Sparkles className="w-4 h-4" />
                  <span>Official Academy Rates</span>
                </div>
              </Reveal>

              <Reveal delay={80}>
                <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-theme leading-tight">
                  Transparent Package Pricing Designed for Every Player
                </h2>
              </Reveal>

              <Reveal delay={140}>
                <p className="text-theme text-base leading-relaxed">
                  All training sessions are <strong>1 Hour</strong> in duration and priced{' '}
                  <strong>per player</strong>. Training days run weekly from{' '}
                  <strong>Sunday to Thursday (3:00 PM &ndash; 11:00 PM)</strong>.
                </p>
              </Reveal>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <PricingTierCard
                  type="private"
                  delay={80}
                  featured={featuredType === 'private'}
                  badge="1-on-1"
                  badgeClass="text-[10px] font-bold px-2 py-0.5 rounded bg-brand/20 text-brand-text"
                />
                <PricingTierCard
                  type="group"
                  delay={180}
                  featured={featuredType === 'group'}
                  badge="Group"
                  badgeClass="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-600 dark:text-purple-300"
                />
              </div>

              <Reveal delay={120} className="pt-4">
                <Link
                  to="/book"
                  className="px-8 py-3.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-extrabold text-sm transition-all shadow-lg shadow-brand/25 inline-flex items-center gap-2"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Book Your Package Now</span>
                </Link>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" className="py-20 border-b border-theme/60 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center max-w-2xl mx-auto space-y-3 mb-14">
            <span className="text-xs font-extrabold uppercase tracking-widest text-brand-text">
              Inside the Academy
            </span>
            <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-theme">
              Explore the Academy
            </h2>
            <p className="text-muted text-sm">
              A look inside our courts, training, and evening atmosphere.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {GALLERY_IMAGES.map((item, gIdx) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                aria-label={`View ${item.title} full screen`}
                onClick={() => setLightIdx(gIdx)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setLightIdx(gIdx)
                  }
                }}
                className="animate-cascade relative rounded-2xl overflow-hidden h-72 border border-theme group bg-slate-900 cursor-pointer"
                style={{ animationDelay: `${gIdx * 70}ms` }}
              >
                {item.video ? (
                  <video
                    src={item.video}
                    poster={item.image}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full object-cover object-[center_28%] group-hover:scale-110 transition-transform duration-700"
                  />
                ) : (
                  <img
                    src={item.image}
                    alt={item.title}
                    className="absolute inset-0 w-full h-full object-cover object-[center_35%] group-hover:scale-110 transition-transform duration-700"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent opacity-90 pointer-events-none" />
                <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between pointer-events-none">
                  <div>
                    <span className="px-2.5 py-1 rounded-md bg-brand/20 border border-brand-text/40 text-brand-text text-[10px] font-extrabold uppercase tracking-wider backdrop-blur-sm">
                      {item.tag}
                    </span>
                    <h4 className="font-heading font-extrabold text-white text-lg mt-1 drop-shadow">{item.title}</h4>
                  </div>
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 shrink-0 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 flex items-center justify-center text-white">
                    <Maximize2 className="w-4 h-4" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PLAYER REVIEWS */}
      <section id="reviews" className="py-20 border-b border-theme/60 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center max-w-2xl mx-auto space-y-3 mb-14">
            <span className="text-xs font-extrabold uppercase tracking-widest text-brand-text">Player Reviews</span>
            <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-theme">
              What Our Players Say
              {comments.length > 0 && (
                <span className="text-brand-text"> ({comments.length})</span>
              )}
            </h2>
            <p className="text-muted text-sm">Trusted by players training with us every week.</p>
          </Reveal>

          {user && (
            <Reveal className="max-w-xl mx-auto mb-10 glass-panel rounded-2xl border border-theme p-5 space-y-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-brand-text" />
                <span className="text-sm font-bold text-theme">Leave a Comment</span>
              </div>
              <div className="flex items-center gap-1" role="group" aria-label="Rating">
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={() => setCommentRating(n)} type="button" aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={n === commentRating}>
                    <Star className={`w-5 h-5 ${n <= commentRating ? 'fill-amber-400 text-amber-400' : 'text-muted'}`} />
                  </button>
                ))}
              </div>
              <textarea value={commentText} onChange={e => setCommentText(e.target.value)} rows={3} aria-label="Your review" placeholder="Share your experience at MM Padel Academy..." className="w-full px-4 py-3 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text resize-none" />
              {commentMsg && <p className={`text-xs ${commentMsg.includes('Thank') ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{commentMsg}</p>}
              <div className="flex items-center gap-3">
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
                }} disabled={commentLoading || !commentText.trim()} className="px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-xs flex items-center gap-2 transition-all disabled:opacity-50">
                  <Send className="w-3.5 h-3.5" />
                  {commentLoading ? 'Submitting...' : 'Submit for Review'}
                </button>
                {!commentText.trim() && !commentLoading && (
                  <span className="text-[11px] text-muted">Write a review to submit.</span>
                )}
              </div>
            </Reveal>
          )}

          {!user && (
            <p className="text-center text-muted text-sm mb-8">Sign in to leave a review.</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {comments.length > 0 ? (showAllReviews ? comments : comments.slice(0, 3)).map((c, cIdx) => (
              <Reveal key={c.id} delay={(cIdx % 3) * 100} className="glass-card rounded-2xl p-6 space-y-3 transition-transform hover:-translate-y-1">
                <div className="flex items-center gap-1 text-amber-400">
                  {[...Array(c.rating || 5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-theme leading-relaxed italic">&quot;{c.text}&quot;</p>
                <div className="flex items-center gap-3 pt-3 border-t border-theme">
                  <div className="w-9 h-9 rounded-full bg-brand/20 text-brand-text flex items-center justify-center font-bold text-xs border border-brand-text/40">
                    {(c.user_name || 'U').charAt(0)}
                  </div>
                  <div>
                    <h5 className="font-bold text-theme text-sm">{c.user_name}</h5>
                  </div>
                </div>
              </Reveal>
            )) : (
              <p className="text-center text-muted text-sm col-span-full">No reviews yet. Be the first to share your experience!</p>
            )}
          </div>

          {comments.length > 3 && (
            <div className="text-center mt-8">
              <button
                type="button"
                onClick={() => setShowAllReviews((v) => !v)}
                className="px-6 py-3 rounded-xl bg-surface hover:bg-slate-100 dark:hover:bg-slate-800 text-theme font-bold text-sm border border-theme transition-all inline-flex items-center gap-2 hover:border-brand-text/50"
              >
                <span>{showAllReviews ? 'Show Less' : `Show More (${comments.length - 3})`}</span>
                <ChevronDown className={`w-4 h-4 text-brand-text transition-transform duration-300 ${showAllReviews ? 'rotate-180' : ''}`} />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 relative border-b border-theme/60 scroll-mt-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center space-y-3 mb-14">
            <span className="text-xs font-extrabold uppercase tracking-widest text-brand-text inline-flex items-center gap-2">
              <HelpCircle className="w-4 h-4" />
              FAQ
            </span>
            <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-theme">
              Frequently Asked Questions
            </h2>
            <p className="text-muted text-sm">Quick answers before your first session.</p>
          </Reveal>

          <div className="space-y-3">
            {FAQS.map((item, i) => {
              const open = openFaq === i
              return (
                <Reveal key={item.q} delay={i * 60}>
                  <div
                    className={`rounded-2xl border transition-colors ${open ? 'border-brand-text/50 bg-brand/5' : 'border-theme bg-surface'}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleFaq(i)}
                      aria-expanded={open}
                      className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left"
                    >
                      <span className="font-heading font-bold text-sm sm:text-base text-theme">
                        {item.q}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-brand-text shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
                      />
                    </button>
                    <div
                      className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                    >
                      <div className="overflow-hidden">
                        <p className="px-5 pb-4 text-sm text-muted leading-relaxed">{item.a}</p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="py-20 border-b border-theme/60 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center max-w-2xl mx-auto space-y-3 mb-14">
            <span className="text-xs font-extrabold uppercase tracking-widest text-brand-text">Find Us</span>
            <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-theme">Contact the Academy</h2>
            <p className="text-muted text-sm">Reach us by phone or WhatsApp, or visit the courts.</p>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Reveal delay={0}>
              <a href={CONTACT.phoneHref} className="glass-card rounded-2xl p-6 flex items-start gap-4 hover:border-brand-text/40 group h-full transition-transform hover:-translate-y-1">
                <span className="p-3 rounded-xl bg-brand/10 text-brand-text border border-brand-text/30">
                  <Phone className="w-5 h-5" />
                </span>
                <span>
                  <span className="block text-xs uppercase tracking-wider text-muted font-bold">Phone / WhatsApp</span>
                  <span className="block text-theme font-extrabold mt-1">{CONTACT.phone}</span>
                </span>
              </a>
            </Reveal>
            <Reveal delay={100}>
              <div className="glass-card rounded-2xl p-6 flex items-start gap-4 group h-full transition-transform hover:-translate-y-1">
                <span className="p-3 rounded-xl bg-brand/10 text-brand-text border border-brand-text/30">
                  <Clock className="w-5 h-5" />
                </span>
                <span>
                  <span className="block text-xs uppercase tracking-wider text-muted font-bold">Hours</span>
                  <span className="block text-theme font-extrabold mt-1">{CONTACT.hours}</span>
                </span>
              </div>
            </Reveal>
            <Reveal delay={200}>
              <a href={mapsUrl} target="_blank" rel="noreferrer" className="glass-card rounded-2xl p-6 flex items-start gap-4 hover:border-brand-text/40 group h-full transition-transform hover:-translate-y-1">
                <span className="p-3 rounded-xl bg-brand/10 text-brand-text border border-brand-text/30">
                  <MapPin className="w-5 h-5" />
                </span>
                <span>
                  <span className="block text-xs uppercase tracking-wider text-muted font-bold">Location</span>
                  <span className="block text-theme text-sm mt-1 leading-relaxed">{CONTACT.address}</span>
                  <span className="block text-brand-text text-xs font-bold mt-2">Open in Google Maps &rarr;</span>
                </span>
              </a>
            </Reveal>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-brand/10 border-t border-theme">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <Reveal>
            <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-theme">Ready to Step Onto the Court?</h2>
          </Reveal>
          <Reveal delay={80}>
            <p className="text-theme max-w-xl mx-auto text-base">
              Book your package online in seconds or register for academy training today.
            </p>
          </Reveal>
          <Reveal delay={160} className="pt-2">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/book"
                className="px-8 py-3.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-extrabold text-sm transition-all shadow-lg shadow-brand/25 flex items-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                <span>Book a Session Now</span>
              </Link>
              {!user ? (
                <Link
                  to="/signup"
                  className="px-8 py-3.5 rounded-xl border border-brand-text/50 text-brand-text hover:bg-brand/10 font-bold text-sm transition-all"
                >
                  <span>Create Free Account</span>
                </Link>
              ) : (
                <Link
                  to="/profile"
                  className="px-8 py-3.5 rounded-xl border border-brand-text/50 text-brand-text hover:bg-brand/10 font-bold text-sm transition-all"
                >
                  <span>View My Profile</span>
                </Link>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Gallery lightbox */}
      {lightIdx !== null && GALLERY_IMAGES[lightIdx] && (
        <div
          className="fixed inset-0 z-[70] bg-slate-950/92 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-label={`${GALLERY_IMAGES[lightIdx].title} preview`}
          onClick={() => setLightIdx(null)}
        >
          <button
            type="button"
            aria-label="Close preview"
            onClick={(e) => {
              e.stopPropagation()
              setLightIdx(null)
            }}
            className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 border border-white/25 text-white flex items-center justify-center transition-all"
          >
            <X className="w-5 h-5" />
          </button>

          <button
            type="button"
            aria-label="Previous image"
            onClick={(e) => {
              e.stopPropagation()
              setLightIdx((i) => (i - 1 + GALLERY_IMAGES.length) % GALLERY_IMAGES.length)
            }}
            className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 border border-white/25 text-white flex items-center justify-center transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            aria-label="Next image"
            onClick={(e) => {
              e.stopPropagation()
              setLightIdx((i) => (i + 1) % GALLERY_IMAGES.length)
            }}
            className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 border border-white/25 text-white flex items-center justify-center transition-all"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <div className="w-full max-w-4xl space-y-3" onClick={(e) => e.stopPropagation()}>
            {GALLERY_IMAGES[lightIdx].video ? (
              <video
                key={GALLERY_IMAGES[lightIdx].id}
                src={GALLERY_IMAGES[lightIdx].video}
                poster={GALLERY_IMAGES[lightIdx].image}
                autoPlay
                controls
                loop
                playsInline
                className="w-full max-h-[68vh] rounded-2xl bg-black object-contain"
              />
            ) : (
              <img
                src={GALLERY_IMAGES[lightIdx].image}
                alt={GALLERY_IMAGES[lightIdx].title}
                className="w-full max-h-[68vh] object-contain rounded-2xl"
              />
            )}

            <div className="flex items-end justify-between gap-4">
              <div className="space-y-1">
                <span className="inline-block px-2.5 py-1 rounded-md bg-brand/20 border border-brand-text/40 text-brand-text text-[10px] font-extrabold uppercase tracking-wider backdrop-blur-sm">
                  {GALLERY_IMAGES[lightIdx].tag}
                </span>
                <h3 className="font-heading font-extrabold text-white text-lg">
                  {GALLERY_IMAGES[lightIdx].title}
                </h3>
              </div>
              <span className="text-xs font-bold text-white/60 shrink-0">
                {lightIdx + 1} / {GALLERY_IMAGES.length}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Section navigator — right-edge vertical rail */}
      {!navNearFooter && (
        <nav
          className="fixed right-3 sm:right-5 top-1/2 -translate-y-1/2 z-40"
          aria-label="Home sections"
        >
          <div className="relative flex flex-col items-end gap-2.5 py-1">
            <span
              aria-hidden="true"
              className="absolute right-[3px] top-2 bottom-2 w-px bg-gradient-to-b from-transparent via-slate-400/40 dark:via-slate-500/50 to-transparent"
            />
            {HOME_TOPICS.map((topic, i) => (
              <div key={topic.id} className="group flex items-center justify-end gap-2.5">
                <span
                  className={`pointer-events-none whitespace-nowrap text-[10px] font-extrabold uppercase tracking-widest transition-all duration-300 ${
                    i === topicIndex
                      ? 'opacity-100 translate-x-0 text-brand-text'
                      : 'opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 text-muted'
                  }`}
                >
                  {topic.label}
                  {i === topicIndex && (
                    <span className="ml-1.5 font-black tabular-nums">
                      <span className="text-gold">{String(topicIndex + 1).padStart(2, '0')}</span>
                      <span className="text-muted">/{String(HOME_TOPICS.length).padStart(2, '0')}</span>
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => scrollToTopic(i)}
                  aria-label={`Go to ${topic.label}`}
                  aria-current={i === topicIndex ? 'true' : undefined}
                  title={topic.label}
                  className={`relative rounded-full transition-all duration-300 ${
                    i === topicIndex
                      ? 'w-7 h-[7px] bg-brand-text shadow-[0_0_10px_rgba(0,168,107,0.8)]'
                      : 'w-3.5 h-[3px] bg-slate-400/70 dark:bg-slate-500/70 hover:w-5 hover:bg-brand-text/70'
                  }`}
                />
              </div>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}
