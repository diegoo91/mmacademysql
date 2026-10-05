# agent.md — Competitive Patterns for MM Padel Academy Website

Researched directly from 4 real competitor sites (a 5th,
hellopadelacademy.com, is a JS-rendered app that didn't return readable
content — noted as a gap, not guessed at). Use this to inform future
homepage/marketing-site work, alongside UI-UX-GUIDELINES.md.

## Sites reviewed
- M3 Padel Academy (m3padelacademy.com) — large international academy
- VIPA Academy (vipa.academy) — **based in Giza, Egypt**, same market as us
- Gustavo Pratto Academy (gustavopratto.com) — personal-brand-led academy
- JMB Padel Academy (jmbpadelacademy.com) — smaller, methodology-focused

## Patterns worth adopting

### 1. WhatsApp deep-links with pre-filled text (seen on 3/4 sites)
Every serious competitor uses `wa.me/NUMBER?text=...` links, not just a
phone number — the message is pre-filled so a visitor taps once and is
already mid-conversation. Example from JMB:
`wa.me/34608623576?text=Hi, I'd like more information!`
We already have this exact pattern in Payment.jsx — extend it to the
public-facing marketing site too (a WhatsApp button in the header/hero,
not just at checkout).

### 2. Transparent, tiered pricing shown ON the homepage (VIPA, most relevant since same market)
VIPA lists exact package pricing right on the homepage — sessions/week,
duration, price in EGP, no "contact us for pricing." This builds trust
fast in a market where people are used to opaque gym/club pricing. We
already HAVE structured pricing tiers (private/group, 1/4/8/12/16) — the
marketing site should show them plainly, not hide them behind a booking
flow.

### 3. A dedicated "Methodology" / "How we train" section (JMB, M3)
Every credible academy explains HOW training works, not just what's
offered — JMB breaks down morning technical sessions vs. afternoon
tactical sessions; M3 has an entire "M3 Method" page. This is a
credibility signal, not filler. Worth a real "Our Method" section once
Laila/Omar's actual coaching approach is documented (see the coach
spotlight item from the marketing plan — this is the same underlying
need).

### 4. Homepage lead-capture form, not just a contact link (VIPA)
VIPA embeds an "Apply Now" form directly on the homepage — first name,
last name, phone, DOB, experience level, preferred program. This is lower
friction than making someone find a contact page. Worth considering for
a "Join the Academy" inline form rather than only a WhatsApp CTA.

### 5. Named testimonials, real people, real quotes (M3, VIPA)
Every site uses specific named testimonials, not generic "great service!"
text. We already have live comments + static testimonials — the Reports/
Home work from the marketing plan should keep this real-name pattern once
approved comments start replacing placeholder ones.

### 6. FAQ section (VIPA)
Common questions answered directly on the homepage (how to join, pricing,
coaches, location) reduces friction before someone has to message/call.
Worth a short FAQ block once the site has settled content.

### 7. Values/mission beyond just "we teach padel" (M3)
M3 has an explicit values section (Sacrifice, Respect, Humility,
Solidarity, Commitment) — reinforces this is a serious program, not
casual court rental. Our slogan ("Get ready for your new level. The real
padel deal.") already gestures at this; a short values list would back
it up concretely.

## What NOT to copy
- None of these sites are React/mobile-app-style booking systems — they're
  marketing sites that hand off to WhatsApp/forms for actual booking. We
  have something better already (a real booking + balance + schedule
  system) — the marketing site's job is to sell that experience and drive
  people INTO the real app, not replicate what these sites do.
- Don't copy design elements wholesale (M3's video hero, Gustavo Pratto's
  multi-country location list) — these don't fit a 2-court single-location
  academy. Take the underlying pattern (credibility, transparency, low-
  friction contact), not the literal layout.