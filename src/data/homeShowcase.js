// Showcase content for the Home page (imagery + marketing copy).
// Pricing truth lives in pricingData.js — the numbers below mirror it.

export const ACADEMY_STATS = [
  { label: 'Panoramic Courts', value: '2 Courts' },
  { label: 'Session Duration', value: '1 Hour' },
  { label: 'Training Days', value: 'Sun–Thu' },
  { label: 'Evening Hours', value: '3–11 PM' },
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
  { id: 1, title: 'Academy Court 1', category: 'Courts', image: `${import.meta.env.BASE_URL}images/hero.png`, tag: 'Panoramic' },
  { id: 2, title: 'Night Session Under LEDs', category: 'Night Play', image: `${import.meta.env.BASE_URL}images/court.png`, tag: 'Pro Lighting' },
  { id: 3, title: 'Group Training Session', category: 'Training', image: `${import.meta.env.BASE_URL}images/clinic.png`, tag: '2-Person Drills' },
  { id: 4, title: 'Player Lounge', category: 'Facilities', image: `${import.meta.env.BASE_URL}images/lounge.png`, tag: 'Amenities' },
  { id: 5, title: 'Official Pricing Flyer', category: 'Facilities', image: `${import.meta.env.BASE_URL}images/pricing.jpg`, tag: 'Official Packages' },
  { id: 6, title: 'Academy Court 2', category: 'Courts', image: `${import.meta.env.BASE_URL}images/hero.png`, tag: 'All-Weather' },
]

export const TESTIMONIALS = [
  {
    id: 1,
    name: 'Zain',
    level: 'Intermediate',
    text: 'The private coaching completely transformed my wall defence. Booking online takes seconds.',
    rating: 5,
    avatar: `${import.meta.env.BASE_URL}images/coach_carlos.png`,
  },
  {
    id: 2,
    name: 'Farida Fathallah',
    level: 'Advanced',
    text: 'The two panoramic courts and the evening schedule are perfect. Best padel community in the city.',
    rating: 5,
    avatar: `${import.meta.env.BASE_URL}images/coach_elena.png`,
  },
  {
    id: 3,
    name: 'Ahmed Saleh',
    level: 'Beginner',
    text: 'Joined the group class as a total beginner. Clear coaching, welcoming vibe, and great facilities.',
    rating: 5,
    avatar: `${import.meta.env.BASE_URL}images/coach_carlos.png`,
  },
]
