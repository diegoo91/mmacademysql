// Showcase content for the Home page (imagery + marketing copy).
// Pricing truth lives in pricingData.js — the numbers below mirror it.

const BASE = import.meta.env.BASE_URL

// Hero background video (Option 2 preview) — captured at the academy.
export const HERO_VIDEO = `${BASE}videos/mm-padel-hero.mp4`
export const HERO_POSTER = `${BASE}images/mm-padel-poster-hero.jpg`

export const ACADEMY_STATS = [
  { label: 'Panoramic Courts', value: '3 Courts' },
  { label: 'Session Duration', value: '1 Hour' },
  { label: 'Training Days', value: 'Sun–Thu' },
  { label: 'Evening Hours', value: '3–11 PM' },
]

export const METHOD_STEPS = [
  {
    n: '01',
    title: 'Train',
    description:
      'Build rock-solid fundamentals — serve, volley, bandeja and controlled rallies with direct coach feedback every session.',
  },
  {
    n: '02',
    title: 'Improve',
    description:
      'Sharpen tactics and movement with live match drills, video review and a personalised plan that tracks your progress.',
  },
  {
    n: '03',
    title: 'Compete',
    description:
      'Step into academy match play and friendly competitions where every player finishes stronger than they started.',
  },
]

export const WHY_MM = [
  {
    title: 'Certified Coaches',
    description:
      'Professional coaches for technique, tactics and match play — for total beginners through competitive players.',
  },
  {
    title: 'Transparent Pricing',
    description:
      'Clear per-player rates on every private and group package. No hidden fees, no surprises — just honest training value.',
  },
  {
    title: 'Live Schedule & Community',
    description:
      'Book day or week slots online, track sessions in your profile and join a vibrant community of regular players.',
  },
]

export const LEVEL_PATHS = [
  {
    title: 'Beginner',
    badge: 'Start Here',
    description: 'Never held a racket? Learn the basics with structured, encouraging group coaching.',
    cta: 'Group Training · from 500 EGP',
  },
  {
    title: 'Intermediate',
    badge: 'Level Up',
    description: 'Sharpen shot selection, court positioning and consistency in mixed-level sessions.',
    cta: 'Group or Private',
  },
  {
    title: 'Advanced',
    badge: 'Compete',
    description: 'Refine high-performance technique and tactics with dedicated 1-on-1 coaching.',
    cta: 'Private Coaching · from 1,000 EGP',
  },
]

export const FAQS = [
  {
    q: 'Where is MM Padel Academy located?',
    a: 'We are on Unnamed Road, Second Al Sheikh Zayed, 3640705, Giza. Tap the map link in the footer for instant directions.',
  },
  {
    q: 'What are your training hours?',
    a: 'We train Sunday to Thursday, 3:00 PM to 11:00 PM, with 1-hour sessions.',
  },
  {
    q: 'How much does a session cost?',
    a: 'Private coaching starts at 1,000 EGP per player and group (2 persons) at 500 EGP per player, with multi-session package discounts.',
  },
  {
    q: 'How do I book a session?',
    a: 'Book online in seconds from the Book page — pick a day or week slot, choose your package and confirm.',
  },
  {
    q: 'How do I pay?',
    a: 'Pay instantly via InstaPay on checkout. You can also pay at the academy before your session.',
  },
  {
    q: 'I am a complete beginner — is that okay?',
    a: 'Absolutely. Our group training is designed for first-timers; just bring court shoes and we handle the rest.',
  },
  {
    q: 'What is the difference between private and group coaching?',
    a: 'Private sessions are focused 1-on-1 work; group sessions train two players together at a matched level for shared drills and match play.',
  },
  {
    q: 'How do I track my remaining sessions?',
    a: 'Every paid session is credited to your account balance — sign in to your profile to see remaining private and group sessions anytime.',
  },
]

export const PROGRAMS = [
  {
    id: 'private',
    title: 'Private Coaching (1-on-1)',
    priceText: '1,000 EGP / session',
    level: 'All Levels',
    duration: '1 Hour',
    image: `${import.meta.env.BASE_URL}images/court.png`,
    description:
      'Dedicated 1-on-1 coaching with personalised drills and technique work.',
    packages: '1 Session (1,000 EGP) • 4 Sessions (3,600 EGP) • 8 Sessions (7,000 EGP) • 12 Sessions (10,800 EGP) • 16 Sessions (14,000 EGP)',
    features: [
      'Dedicated personal coach',
      'Technique, footwork & glass play',
      'Per player rate • 1 Hour duration',
      'Sun–Thu, 3:00 PM – 11:00 PM',
    ],
  },
  {
    id: 'group',
    title: 'Group (2 Persons)',
    priceText: '500 EGP / session',
    level: 'All Levels',
    duration: '1 Hour',
    image: `${import.meta.env.BASE_URL}images/clinic.png`,
    description: 'High-energy 2-person group training matched by skill level.',
    packages: '1 Session (500 EGP) • 4 Sessions (1,800 EGP) • 8 Sessions (3,500 EGP) • 16 Sessions (7,000 EGP)',
    features: [
      '2-person group sessions',
      'Match scenario drills',
      'Per player rate • 1 Hour duration',
      'Sun–Thu, 3:00 PM – 11:00 PM',
    ],
  },
]

// Gallery — captured at MM Padel Academy (all footage/photos of Coach Mahmoud
// Moharam except the Yasin Fathalla session card, which pairs both).
// Background music on the Yasin & Defence and Control clips (original audio
// removed): "Stomp" by Alex-Productions — CC BY 3.0. Required credit if this
// ever ships: Stomp by Alex-Productions | https://onsound.eu/ | Royalty Free
// Music by https://www.free-stock-music.com | CC BY 3.0
export const GALLERY_IMAGES = [
  {
    id: 1,
    title: 'Coach Moharam — Match Serve',
    category: 'Competition',
    image: `${BASE}images/mm-padel-poster-serve.jpg`,
    video: `${BASE}videos/mm-padel-serve.mp4`,
    tag: 'Competition',
  },
  {
    id: 2,
    title: 'Tournament Ready',
    category: 'Competition',
    image: `${BASE}images/mm-padel-gallery-ready.jpg`,
    tag: 'Midar Tour',
  },
  {
    id: 3,
    title: 'Golden Hour Footwork',
    category: 'Training',
    image: `${BASE}images/mm-padel-poster-goldenfootwork.jpg`,
    video: `${BASE}videos/mm-padel-goldenfootwork.mp4`,
    tag: 'Technique',
  },
  {
    id: 4,
    title: 'Overhead Smash',
    category: 'Training',
    image: `${BASE}images/mm-padel-poster-overhead.jpg`,
    video: `${BASE}videos/mm-padel-footwork.mp4`,
    tag: 'Match Play',
  },
  {
    id: 5,
    title: 'Defence and Control',
    category: 'Training',
    image: `${BASE}images/mm-padel-poster-netplay.jpg`,
    video: `${BASE}videos/mm-padel-netplay.mp4`,
    tag: 'Day Session',
  },
  {
    id: 6,
    title: 'Yasin Fathalla × Coach Moharam',
    category: 'Live Session',
    image: `${BASE}images/mm-padel-poster-yasin.jpg`,
    video: `${BASE}videos/mm-padel-yasin-session.mp4`,
    tag: 'Live Session',
  },
]
