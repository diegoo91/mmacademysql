// Showcase content for the Home page (imagery + marketing copy).
// Pricing truth lives in pricingData.js — the numbers below mirror it.

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

export const GALLERY_IMAGES = [
  {
    id: 1,
    title: 'Academy Court 1',
    category: 'Courts',
    image: `${import.meta.env.BASE_URL}images/hero.png`,
    video: `${import.meta.env.BASE_URL}videos/padel-court.mp4`,
    tag: 'Panoramic',
  },
  {
    id: 2,
    title: 'Evening Training Session',
    category: 'Evening Play',
    image: `${import.meta.env.BASE_URL}images/court.png`,
    video: `${import.meta.env.BASE_URL}videos/padel-sunset.mp4`,
    tag: 'Evening Play',
  },
  {
    id: 3,
    title: 'Group Training Session',
    category: 'Training',
    image: `${import.meta.env.BASE_URL}images/clinic.png`,
    video: `${import.meta.env.BASE_URL}videos/padel-racket.mp4`,
    tag: '2-Person Drills',
  },
  {
    id: 4,
    title: 'Player Lounge',
    category: 'Facilities',
    image: `${import.meta.env.BASE_URL}images/lounge.png`,
    tag: 'Amenities',
  },
  {
    id: 5,
    title: 'Official Pricing Flyer',
    category: 'Facilities',
    image: `${import.meta.env.BASE_URL}images/pricing.jpg`,
    tag: 'Official Packages',
  },
  {
    id: 6,
    title: 'Academy Court 2',
    category: 'Courts',
    image: `${import.meta.env.BASE_URL}images/hero.png`,
    tag: 'Outdoor',
  },
]
