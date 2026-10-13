import { Calendar, Clock, User, Users } from 'lucide-react'
import { PRICING } from '../data/pricingData'
import { TAGLINE } from '../data/siteConfig'

/**
 * Official pricing flyer — the site-colored replacement for the old
 * burgundy images/pricing.jpg. Photo-hero styling (real court photo with a
 * dark-green gradient wash) over the poster card: theme surfaces #0D1B18/
 * #142C26, jade brand accents (#00A86B/#50C878) and gold (#C49A45) price
 * figures. Matches public/images/pricing.jpg; numbers come from
 * pricingData.js so price edits propagate automatically.
 */
const TIERS = [
  { type: 'private', Icon: User },
  { type: 'group', Icon: Users },
]

const HERO_OVERLAY =
  'linear-gradient(180deg, rgba(13,27,24,0.72) 0%, rgba(13,27,24,0.30) 34%, rgba(13,27,24,0.55) 62%, #0D1B18 100%), linear-gradient(180deg, rgba(0,90,60,0.30), rgba(0,90,60,0.12) 60%, transparent)'

const fmt = (n) => n.toLocaleString('en-US')

function countsOf(type) {
  return Object.keys(PRICING[type])
    .filter((k) => k !== 'name')
    .map(Number)
    .sort((a, b) => a - b)
}

function TierCard({ type, Icon }) {
  const tier = PRICING[type]
  const counts = countsOf(type)

  return (
    <div className="rounded-2xl border border-brand/35 bg-white/[0.06] p-3 sm:p-4">
      <div className="text-center pb-3 border-b border-gold/35 space-y-1.5">
        <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-brand/20 text-brand-text shadow-[0_0_18px_rgba(0,168,107,0.35)]">
          <Icon className="h-4.5 w-4.5" strokeWidth={2.5} />
        </span>
        <h3 className="font-heading text-[11px] sm:text-sm font-black uppercase tracking-wider text-white leading-tight">
          {tier.name}
        </h3>
        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.35em] text-brand-text">
          Sessions
        </p>
      </div>
      <ul>
        {counts.map((count) => (
          <li
            key={count}
            className="flex flex-wrap items-baseline justify-between gap-x-2 border-b border-white/5 py-1.5 last:border-0"
          >
            <span className="whitespace-nowrap text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-white/70">
              {count} Session{count > 1 ? 's' : ''}
            </span>
            <span className="ml-auto font-heading text-sm sm:text-base font-black text-gold whitespace-nowrap">
              {fmt(tier[count])}
              <span className="ml-1 text-[9px] sm:text-[10px] font-bold text-white/60">EGP</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function InfoChip({ Icon, children }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-brand/35 bg-brand/10 px-3 py-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-brand-text" strokeWidth={2.5} />
      <span className="text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider text-white/85 text-center">
        {children}
      </span>
    </div>
  )
}

export default function PricingCard({ className = '', stack = false }) {
  return (
    <div
      className={`w-full overflow-hidden rounded-3xl border-2 border-brand/45 bg-[#0D1B18] shadow-2xl shadow-black/50 ${className}`}
    >
      <div className="relative isolate">
        <img
          src={`${import.meta.env.BASE_URL}images/court.png`}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0" style={{ background: HERO_OVERLAY }} />
        <div
          className="relative px-4 pt-7 pb-6 text-center sm:pt-9 sm:pb-8"
          style={{ textShadow: '0 4px 20px rgba(0,0,0,0.7)' }}
        >
          <img
            src={`${import.meta.env.BASE_URL}images/logo-badge.png`}
            alt="MM Padel Academy"
            className="mx-auto h-14 w-14 sm:h-16 sm:w-16 rounded-2xl object-cover shadow-[0_14px_40px_rgba(0,0,0,0.55)]"
          />
          <h2 className="mt-2 font-heading text-2xl sm:text-4xl font-black tracking-wide text-white leading-none">
            MM PADEL
          </h2>
          <p className="mt-1 font-heading text-[11px] sm:text-sm font-bold uppercase tracking-[0.45em] text-brand-text">
            Academy
          </p>
          <p className="mt-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.3em] text-white/65">
            {TAGLINE}
          </p>
          <span className="mt-3 inline-block rounded-full border border-gold/55 bg-[#0D1B18]/60 px-3 py-1.5 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.3em] text-gold">
            Official Price List &middot; EGP
          </span>
        </div>
      </div>

      <div className="px-4 pb-4 sm:px-6 sm:pb-6">
        <div
          className={`grid gap-3 sm:gap-4 ${
            stack ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
          }`}
        >
          {TIERS.map(({ type, Icon }) => (
            <TierCard key={type} type={type} Icon={Icon} />
          ))}
        </div>

        <div className="mt-4 space-y-2.5">
          <div className="grid grid-cols-2 gap-3">
            <InfoChip Icon={Clock}>1 Hour Sessions</InfoChip>
            <InfoChip Icon={User}>Prices Per Player</InfoChip>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-xl border border-brand/35 bg-brand/10 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-brand-text" strokeWidth={2.5} />
              <span className="truncate text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider text-white/85">
                Sun &ndash; Thu &middot; 3 PM &ndash; 11 PM
              </span>
            </div>
            <span className="shrink-0 rounded-full bg-brand px-2.5 py-1 text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-white">
              Weekly
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
