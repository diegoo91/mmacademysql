import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  HelpCircle,
  MapPin,
  Medal,
  MessageSquare,
  Phone,
  Route,
  Send,
  Sparkles,
  Star,
  Target,
  Trophy,
  Tv,
  Users,
  HeartHandshake,
  Zap,
} from 'lucide-react'
import {
  ACADEMY_STATS,
  FAQS,
  GALLERY_IMAGES,
  LEVEL_PATHS,
  METHOD_STEPS,
  PROGRAMS,
  WHY_MM,
} from '../data/homeShowcase'
import { CONTACT } from '../data/siteConfig'
import { api, fileUrl } from '../lib/api'
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

const marqueeItems = [
  'Train • Improve • Compete',
  'Certified Coaches',
  'Sun–Thu · 3–11 PM',
  'Private & Group Coaching',
  'Sheikh Zayed, Giza',
  'Book Online Instantly',
]

const whyIcons = [Target, Sparkles, Users]
const levelIcons = [Zap, Route, Trophy]

const HOME_TOPICS = [
  { id: 'hero', label: 'Home' },
  { id: 'team', label: 'Team' },
  { id: 'method', label: 'Method' },
  { id: 'why', label: 'Why MM' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'programs', label: 'Programs' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'faq', label: 'FAQ' },
  { id: 'contact', label: 'Contact' },
]

export default function Home() {
  const [galleryFilter, setGalleryFilter] = useState('All')
  const { user } = useAuth()
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [commentRating, setCommentRating] = useState(5)
  const [commentLoading, setCommentLoading] = useState(false)
  const [commentMsg, setCommentMsg] = useState('')
  const [coaches, setCoaches] = useState([])
  const [openFaq, setOpenFaq] = useState(null)
  const [showAllReviews, setShowAllReviews] = useState(false)
  const [topicIndex, setTopicIndex] = useState(0)

  const courtsCount = useCountUp(3, 1000)
  const sessionCount = useCountUp(1, 900)

  const toggleFaq = useCallback((i) => {
    setOpenFaq((prev) => (prev === i ? null : i))
  }, [])

  useEffect(() => {
    api.get('/comments').then(data => setComments(data || [])).catch(() => {})
    api.get('/users/public/coaches').then(data => setCoaches(Array.isArray(data) ? data : [])).catch(() => {})
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
  }, [coaches.length])

  const scrollToTopic = useCallback((nextIdx) => {
    const max = HOME_TOPICS.length - 1
    const clamped = Math.min(Math.max(nextIdx, 0), max)
    const el = document.getElementById(HOME_TOPICS[clamped].id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setTopicIndex(clamped)
  }, [])

  const filteredGallery =
    galleryFilter === 'All'
      ? GALLERY_IMAGES
      : GALLERY_IMAGES.filter((img) => img.category === galleryFilter)

  const mapsUrl = CONTACT.mapsUrl

  return (
    <div className="min-h-screen bg-theme text-theme overflow-hidden">
      {/* 1. HERO — centered Image-2 style, faded + catchy */}
      <section
        id="hero"
        className="relative py-28 lg:py-36 overflow-hidden border-b border-white/10 bg-[linear-gradient(165deg,#3D8B76_0%,#2A6B5C_42%,#1F5246_100%)] text-white"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(255,255,255,0.18),transparent_60%)] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_15%_70%,rgba(79,209,165,0.22),transparent_55%)] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_85%_30%,rgba(196,154,69,0.16),transparent_50%)] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_60%_at_50%_100%,rgba(13,27,24,0.45),transparent_55%)] pointer-events-none" />
        <div className="absolute -top-24 left-1/4 w-72 h-72 rounded-full bg-emerald-300/25 blur-[100px] animate-float pointer-events-none" />
        <div className="absolute bottom-10 right-1/5 w-64 h-64 rounded-full bg-gold/20 blur-[90px] animate-float pointer-events-none" style={{ animationDelay: '1.2s' }} />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-black/25 pointer-events-none" />

        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center space-y-8">
          <p
            className="text-[11px] sm:text-xs font-extrabold uppercase tracking-[0.35em] text-white/65 animate-rise"
          >
            Train &bull; Improve &bull; Compete
          </p>

          <h1
            className="font-serif-display text-4xl sm:text-5xl lg:text-6xl font-medium leading-[1.15] tracking-tight animate-rise"
            style={{ animationDelay: '80ms' }}
          >
            <span className="text-transparent bg-clip-text bg-[linear-gradient(100deg,#FFFFFF_0%,#E8FFF5_35%,#4FD1A5_70%,#FFFFFF_100%)] bg-[length:200%_auto] animate-[shineText_6s_ease_infinite]">
              Get ready for your new level
            </span>
          </h1>

          <p
            className="text-base sm:text-lg text-white/60 max-w-2xl mx-auto leading-relaxed animate-rise"
            style={{ animationDelay: '160ms' }}
          >
            Professional padel coaching across our 3 dedicated courts &mdash; private coaching and
            group classes, 1-hour sessions, Sunday to Thursday, 3:00 PM to 11:00 PM.
          </p>

          <div
            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2 animate-rise"
            style={{ animationDelay: '240ms' }}
          >
            <Link
              to="/book"
              className="w-full sm:w-auto px-9 py-4 rounded-full bg-gold hover:bg-gold-hover text-slate-950 font-extrabold text-base transition-all shadow-[0_0_28px_rgba(196,154,69,0.45)] flex items-center justify-center gap-3 hover:scale-105 hover:shadow-[0_0_40px_rgba(196,154,69,0.65)] active:scale-95 btn-sheen"
            >
              <Calendar className="w-5 h-5 stroke-[2.5]" />
              <span>Book a session</span>
            </Link>

            <a
              href="#programs"
              className="w-full sm:w-auto px-9 py-4 rounded-full border border-white/40 bg-white/5 backdrop-blur-sm text-white/90 font-extrabold text-base transition-all flex items-center justify-center gap-3 hover:bg-white/15 hover:border-white/70 hover:text-white"
            >
              <span>View programs</span>
              <ArrowRight className="w-5 h-5" />
            </a>
          </div>

          <div className="pt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-white/50 font-medium">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-white/55" />
              <span>Sun &ndash; Thu (3 PM &ndash; 11 PM)</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-white/55" />
              <span>1 Hour Sessions</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-white/55" />
              <span>InstaPay Instant Transfer</span>
            </div>
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

      {/* 1b. MARQUEE */}
      <section aria-hidden className="py-3 bg-brand text-white overflow-hidden border-b border-brand-hover/60">
        <div className="flex w-max animate-marquee">
          {[...marqueeItems, ...marqueeItems, ...marqueeItems, ...marqueeItems].map((item, i) => (
            <span
              key={i}
              className="flex items-center gap-6 px-6 text-xs font-extrabold uppercase tracking-widest whitespace-nowrap"
            >
              <span>{item}</span>
              <span className="text-gold">◆</span>
            </span>
          ))}
        </div>
      </section>

      {/* 1b2. OUR TEAM — right after hero/marquee */}
      {coaches.length > 0 && (
      <section id="team" className="py-20 relative border-b border-theme/60 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center max-w-2xl mx-auto space-y-3 mb-14">
            <span className="text-xs font-extrabold uppercase tracking-widest text-brand-text">
              Our Team
            </span>
            <h2 className="font-heading text-3xl font-extrabold text-theme">Meet the Coaches</h2>
            <p className="text-muted text-sm">
              Certified padel coaches guiding every level — from first rally to competitive play.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {coaches.map((member, mIdx) => (
              <Reveal key={member.id} delay={mIdx * 100} className="glass-card rounded-2xl p-6 text-center space-y-4 bg-surface/60 dark:bg-slate-900/60 hover:-translate-y-1 transition-transform group">
                <div className="relative w-28 h-28 mx-auto">
                  {member.avatar ? (
                    <img
                      src={fileUrl(member.avatar)}
                      alt={member.name}
                      className="w-28 h-28 rounded-full object-cover border-4 border-brand/30 shadow-lg shadow-brand/10"
                    />
                  ) : (
                    <div className="w-28 h-28 rounded-full bg-brand/15 border-4 border-brand/30 shadow-lg shadow-brand/10 flex items-center justify-center text-brand-text text-4xl font-black font-heading">
                      {(member.name || 'C').replace(/^Coach\s+/i, '').charAt(0) || 'C'}
                    </div>
                  )}
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-brand text-white text-[10px] font-extrabold uppercase tracking-wider shadow">
                    Coach
                  </span>
                </div>
                <div>
                  <h4 className="font-heading font-extrabold text-theme text-lg">{member.name}</h4>
                  <p className="text-xs font-bold text-brand-text mt-1">{member.notes || 'Certified Coach'}</p>
                  <p className="text-xs text-muted mt-2 leading-relaxed">{member.skill_level || 'All Levels'}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* 1c. OUR METHOD */}
      <section id="method" className="py-20 border-b border-theme/60 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center max-w-3xl mx-auto space-y-4 mb-14">
            <span className="text-xs font-extrabold uppercase tracking-widest text-brand-text">
              Our Method
            </span>
            <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-theme">
              Train. Improve. Compete.
            </h2>
            <p className="text-muted text-base">
              A simple, proven path every player follows at MM Padel Academy.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {METHOD_STEPS.map((step, i) => (
              <Reveal key={step.n} delay={i * 120} className="glass-card rounded-2xl p-7 bg-surface/60 dark:bg-slate-900/60 relative overflow-hidden group">
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
        </div>
      </section>

      {/* 1d. WHY MM + FIND YOUR LEVEL */}
      <section id="why" className="py-20 bg-slate-100/40 dark:bg-slate-900/40 border-b border-theme/60 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center max-w-3xl mx-auto space-y-4 mb-12">
            <span className="text-xs font-extrabold uppercase tracking-widest text-brand-text">
              Why MM Padel Academy
            </span>
            <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-theme">
              Built for Players Who Want More
            </h2>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {WHY_MM.map((item, i) => {
              const Icon = whyIcons[i]
              return (
                <Reveal key={item.title} delay={i * 110} className="glass-card rounded-2xl p-6 bg-surface/70 dark:bg-slate-900/60 group">
                  <span className="inline-flex p-3 rounded-xl bg-brand/10 text-brand-text border border-brand-text/30 mb-4">
                    <Icon className="w-5 h-5 icon-bounce" />
                  </span>
                  <h3 className="font-heading font-extrabold text-lg text-theme mb-2 group-hover:text-brand-text transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted leading-relaxed">{item.description}</p>
                </Reveal>
              )
            })}
            <Reveal delay={330} className="glass-card rounded-2xl p-6 bg-surface/70 dark:bg-slate-900/60 group">
              <span className="inline-flex p-3 rounded-xl bg-brand/10 text-brand-text border border-brand-text/30 mb-4">
                <Tv className="w-5 h-5 icon-bounce" />
              </span>
              <h3 className="font-heading font-extrabold text-lg text-theme mb-2 group-hover:text-brand-text transition-colors">
                Live Matches on Our Courts
              </h3>
              <p className="text-sm text-muted leading-relaxed">
                Feel the real game: live padel matches on our courts, from academy friendlies to competitive play.
              </p>
            </Reveal>
          </div>

          <Reveal className="text-center max-w-3xl mx-auto space-y-4 mb-10">
            <span className="text-xs font-extrabold uppercase tracking-widest text-brand-text">
              Find Your Level
            </span>
            <h2 className="font-heading text-3xl font-extrabold text-theme">
              Every Player Has a Path
            </h2>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {LEVEL_PATHS.map((path, i) => {
              const Icon = levelIcons[i]
              return (
                <Reveal key={path.title} delay={i * 110} className="glass-card rounded-2xl p-6 bg-surface/70 dark:bg-slate-900/60 flex flex-col group">
                  <div className="flex items-center justify-between mb-4">
                    <span className="p-2.5 rounded-xl bg-brand/10 text-brand-text border border-brand-text/30">
                      <Icon className="w-5 h-5 icon-bounce" />
                    </span>
                    <span className="px-3 py-1 rounded-full bg-gold/15 border border-gold/40 text-gold text-[10px] font-extrabold uppercase tracking-wider">
                      {path.badge}
                    </span>
                  </div>
                  <h3 className="font-heading font-extrabold text-xl text-theme mb-2 group-hover:text-brand-text transition-colors">
                    {path.title}
                  </h3>
                  <p className="text-sm text-muted leading-relaxed flex-1">{path.description}</p>
                  <p className="mt-4 text-xs font-bold text-brand-text">{path.cta}</p>
                </Reveal>
              )
            })}
          </div>

          <Reveal className="text-center mt-10">
            <Link
              to="/book"
              className="px-8 py-3.5 rounded-xl bg-gold hover:bg-gold-hover text-slate-950 font-extrabold text-sm transition-all shadow-lg shadow-gold/30 inline-flex items-center gap-2 btn-sheen"
            >
              <Calendar className="w-4 h-4" />
              <span>Book Your Path</span>
            </Link>
          </Reveal>
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
                  <Sparkles className="w-4 h-4 icon-bounce" />
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
                <Reveal delay={80} className="p-5 rounded-2xl bg-surface border border-theme space-y-3">
                  <div className="flex justify-between items-center border-b border-theme pb-2">
                    <h4 className="font-heading font-extrabold text-theme text-base">Private Coaching</h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-brand/20 text-brand-text">1-on-1</span>
                  </div>
                  <ul className="space-y-2 text-xs">
                    <li className="flex justify-between text-theme">
                      <span>1 Session:</span>
                      <strong className="text-theme">1,000 EGP</strong>
                    </li>
                    <li className="flex justify-between text-theme">
                      <span>4 Sessions:</span>
                      <strong className="text-brand-text">3,600 EGP</strong>
                    </li>
                    <li className="flex justify-between text-theme">
                      <span>8 Sessions:</span>
                      <strong className="text-brand-text font-extrabold">7,000 EGP</strong>
                    </li>
                    <li className="flex justify-between text-theme">
                      <span>12 Sessions:</span>
                      <strong className="text-brand-text">10,800 EGP</strong>
                    </li>
                    <li className="flex justify-between text-theme">
                      <span>16 Sessions:</span>
                      <strong className="text-brand-text font-extrabold">14,000 EGP</strong>
                    </li>
                  </ul>
                </Reveal>

                <Reveal delay={180} className="p-5 rounded-2xl bg-surface border border-theme space-y-3">
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
                      <strong className="text-brand-text">1,800 EGP</strong>
                    </li>
                    <li className="flex justify-between text-theme">
                      <span>8 Sessions:</span>
                      <strong className="text-brand-text font-extrabold">3,500 EGP</strong>
                    </li>
                    <li className="flex justify-between text-theme">
                      <span>16 Sessions:</span>
                      <strong className="text-brand-text font-extrabold">7,000 EGP</strong>
                    </li>
                  </ul>
                </Reveal>
              </div>

              <Reveal delay={120} className="pt-4">
                <Link
                  to="/book"
                  className="px-8 py-3.5 rounded-xl bg-gold hover:bg-gold-hover text-slate-950 font-extrabold text-sm transition-all shadow-lg shadow-gold/30 inline-flex items-center gap-2 btn-sheen"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Book Your Package Now</span>
                </Link>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* 3. PROGRAMS */}
      <section id="programs" className="py-20 relative border-b border-theme/60 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center max-w-3xl mx-auto space-y-4 mb-16">
            <span className="text-xs font-extrabold uppercase tracking-widest text-brand-text">
              Training Programs
            </span>
            <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-theme">
              Tailored Programs for Every Level
            </h2>
            <p className="text-muted text-base">
              Private coaching or group classes &mdash; pick the path that fits your game.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {PROGRAMS.map((program, pIdx) => (
              <Reveal key={program.id} delay={pIdx * 120} className="glass-card rounded-2xl overflow-hidden flex flex-col justify-between group bg-surface/60 dark:bg-slate-900/60">
                <div>
                  <div className="relative h-48 overflow-hidden bg-surface border-theme">
                    <img
                      src={program.image}
                      alt={program.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-slate-950/80 backdrop-blur-md border border-slate-700 text-xs font-bold text-brand-text">
                      {program.level}
                    </div>
                    <div className="absolute bottom-3 right-3 px-3 py-1 rounded-full bg-brand text-white font-extrabold text-xs">
                      {program.priceText}
                    </div>
                  </div>

                  <div className="p-5 space-y-3">
                    <h3 className="font-heading font-extrabold text-lg text-theme group-hover:text-brand-text transition-colors">
                      {program.title}
                    </h3>
                    <p className="text-xs text-muted line-clamp-2 leading-relaxed">{program.description}</p>

                    <div className="p-2.5 rounded-xl bg-surface border border-theme text-[11px] text-brand-text font-semibold">
                      {program.packages}
                    </div>

                    <ul className="space-y-2 pt-2 border-t border-theme/80">
                      {program.features.map((feat, fIdx) => (
                        <li key={fIdx} className="text-xs text-theme flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-brand-text shrink-0" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="p-5 pt-0">
                  <Link
                    to="/book"
                    className="w-full py-2.5 rounded-xl bg-surface hover:bg-brand hover:text-white text-theme font-bold text-xs transition-all border border-theme hover:border-brand-text flex items-center justify-center gap-2"
                  >
                    <span>Book This Program</span>
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 4. GALLERY */}
      <section id="gallery" className="py-20 bg-slate-100/30 dark:bg-slate-900/30 border-b border-theme/60 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-widest text-brand-text">
                Court Showcase &amp; Facilities
              </span>
              <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-theme mt-1">
                Explore the Academy
              </h2>
            </div>

            <div className="flex flex-wrap gap-2">
              {['All', 'Courts', 'Evening Play', 'Training', 'Facilities'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setGalleryFilter(cat)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    galleryFilter === cat
                      ? 'bg-brand text-white shadow-md shadow-brand/20'
                      : 'bg-surface text-theme hover:bg-slate-100 dark:hover:bg-slate-800 border border-theme'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </Reveal>

          <div key={galleryFilter} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGallery.map((item, gIdx) => (
              <div
                key={item.id}
                className="animate-cascade relative rounded-2xl overflow-hidden h-72 border border-theme group bg-slate-900"
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
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  />
                ) : (
                  <img
                    src={item.image}
                    alt={item.title}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent opacity-90 pointer-events-none" />
                <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950/70 backdrop-blur-sm border border-white/15 text-[10px] font-extrabold uppercase tracking-wider text-white/90 pointer-events-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {item.video ? 'Live Clip' : 'Photo'}
                </div>
                <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between pointer-events-none">
                  <div>
                    <span className="px-2.5 py-1 rounded-md bg-brand/20 border border-brand-text/40 text-brand-text text-[10px] font-extrabold uppercase tracking-wider backdrop-blur-sm">
                      {item.tag}
                    </span>
                    <h4 className="font-heading font-extrabold text-white text-lg mt-1 drop-shadow">{item.title}</h4>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. PLAYER REVIEWS */}
      <section id="reviews" className="py-20 bg-slate-100/40 dark:bg-slate-900/40 border-b border-theme/60 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center max-w-2xl mx-auto space-y-3 mb-14">
            <span className="text-xs font-extrabold uppercase tracking-widest text-brand-text">Player Reviews</span>
            <h2 className="font-heading text-3xl font-extrabold text-theme">
              What Our Players Say
              {comments.length > 0 && (
                <span className="text-brand-text"> ({comments.length})</span>
              )}
            </h2>
          </Reveal>

          {user && (
            <Reveal className="max-w-xl mx-auto mb-10 glass-panel rounded-2xl border border-theme p-5 space-y-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-brand-text" />
                <span className="text-sm font-bold text-theme">Leave a Comment</span>
              </div>
              <div className="flex items-center gap-1">
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={() => setCommentRating(n)} type="button">
                    <Star className={`w-5 h-5 ${n <= commentRating ? 'fill-amber-400 text-amber-400' : 'text-muted'}`} />
                  </button>
                ))}
              </div>
              <textarea value={commentText} onChange={e => setCommentText(e.target.value)} rows={3} placeholder="Share your experience at MM Padel Academy..." className="w-full px-4 py-3 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text resize-none" />
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
              }} disabled={commentLoading || !commentText.trim()} className="px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-xs flex items-center gap-2 transition-all disabled:opacity-50">
                <Send className="w-3.5 h-3.5" />
                {commentLoading ? 'Submitting...' : 'Submit for Review'}
              </button>
            </Reveal>
          )}

          {!user && (
            <p className="text-center text-muted text-sm mb-8">Sign in to leave a review.</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {comments.length > 0 ? (showAllReviews ? comments : comments.slice(0, 6)).map((c, cIdx) => (
              <Reveal key={c.id} delay={(cIdx % 3) * 100} className="glass-card rounded-2xl p-6 space-y-3 bg-surface/60 dark:bg-slate-900/60">
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

          {comments.length > 6 && (
            <div className="text-center mt-8">
              <button
                type="button"
                onClick={() => setShowAllReviews((v) => !v)}
                className="px-6 py-3 rounded-xl bg-surface hover:bg-slate-100 dark:hover:bg-slate-800 text-theme font-bold text-sm border border-theme transition-all inline-flex items-center gap-2 hover:border-brand-text/50"
              >
                <span>{showAllReviews ? 'Show Less' : `Show More (${comments.length - 6})`}</span>
                <ChevronDown className={`w-4 h-4 text-brand-text transition-transform duration-300 ${showAllReviews ? 'rotate-180' : ''}`} />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 relative border-b border-theme/60 scroll-mt-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center space-y-3 mb-10">
            <span className="text-xs font-extrabold uppercase tracking-widest text-brand-text inline-flex items-center gap-2">
              <HelpCircle className="w-4 h-4" />
              FAQ
            </span>
            <h2 className="font-heading text-3xl font-extrabold text-theme">
              Frequently Asked Questions
            </h2>
          </Reveal>

          <div className="space-y-3">
            {FAQS.map((item, i) => {
              const open = openFaq === i
              return (
                <Reveal key={item.q} delay={i * 60}>
                  <div
                    className={`rounded-2xl border transition-colors ${open ? 'border-brand-text/50 bg-brand/5' : 'border-theme bg-surface/60 dark:bg-slate-900/50'}`}
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

      {/* 7. CONTACT */}
      <section id="contact" className="py-20 bg-slate-100/40 dark:bg-slate-900/40 border-b border-theme/60 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center max-w-2xl mx-auto space-y-3 mb-12">
            <span className="text-xs font-extrabold uppercase tracking-widest text-brand-text">Find Us</span>
            <h2 className="font-heading text-3xl font-extrabold text-theme">Contact the Academy</h2>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Reveal delay={0}>
              <a href={CONTACT.phoneHref} className="glass-card rounded-2xl p-6 flex items-start gap-4 hover:border-brand-text/40 group h-full">
                <span className="p-3 rounded-xl bg-brand/10 text-brand-text border border-brand-text/30">
                  <Phone className="w-5 h-5 icon-bounce" />
                </span>
                <span>
                  <span className="block text-xs uppercase tracking-wider text-muted font-bold">Phone / WhatsApp</span>
                  <span className="block text-theme font-extrabold mt-1">{CONTACT.phone}</span>
                </span>
              </a>
            </Reveal>
            <Reveal delay={100}>
              <div className="glass-card rounded-2xl p-6 flex items-start gap-4 group h-full">
                <span className="p-3 rounded-xl bg-brand/10 text-brand-text border border-brand-text/30">
                  <Clock className="w-5 h-5 icon-bounce" />
                </span>
                <span>
                  <span className="block text-xs uppercase tracking-wider text-muted font-bold">Hours</span>
                  <span className="block text-theme font-extrabold mt-1">{CONTACT.hours}</span>
                </span>
              </div>
            </Reveal>
            <Reveal delay={200}>
              <a href={mapsUrl} target="_blank" rel="noreferrer" className="glass-card rounded-2xl p-6 flex items-start gap-4 hover:border-brand-text/40 group h-full">
                <span className="p-3 rounded-xl bg-brand/10 text-brand-text border border-brand-text/30">
                  <MapPin className="w-5 h-5 icon-bounce" />
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
      <section className="py-16 bg-gradient-to-r from-brand/20 via-emerald-500/10 to-slate-100 dark:to-slate-900 border-t border-theme">
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
                className="px-8 py-3.5 rounded-xl bg-gold hover:bg-gold-hover text-slate-950 font-extrabold text-sm transition-all shadow-lg shadow-gold/30 flex items-center gap-2 btn-sheen"
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
          </Reveal>
        </div>
      </section>

      {/* Fade scroll arrows — advance to next/prev home topic */}
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3"
        role="navigation"
        aria-label="Home sections"
      >
        <button
          type="button"
          aria-label="Previous section"
          onClick={() => scrollToTopic(topicIndex - 1)}
          disabled={topicIndex <= 0}
          className="w-11 h-11 rounded-full glass-panel border border-theme/60 flex items-center justify-center text-theme hover:border-brand-text/50 hover:text-brand-text transition-all disabled:opacity-30 disabled:pointer-events-none shadow-lg animate-fade-arrow"
        >
          <ChevronUp className="w-5 h-5" />
        </button>

        <span className="px-4 h-11 rounded-full glass-panel border border-theme/60 flex items-center text-xs font-extrabold uppercase tracking-widest text-brand-text shadow-lg select-none">
          {HOME_TOPICS[topicIndex]?.label || 'Home'}
          <span className="ml-2 text-muted font-bold">
            {topicIndex + 1}/{HOME_TOPICS.length}
          </span>
        </span>

        <button
          type="button"
          aria-label="Next section"
          onClick={() => scrollToTopic(topicIndex + 1)}
          disabled={topicIndex >= HOME_TOPICS.length - 1}
          className="w-11 h-11 rounded-full glass-panel border border-theme/60 flex items-center justify-center text-theme hover:border-brand-text/50 hover:text-brand-text transition-all disabled:opacity-30 disabled:pointer-events-none shadow-lg animate-fade-arrow"
          style={{ animationDelay: '1.1s' }}
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
