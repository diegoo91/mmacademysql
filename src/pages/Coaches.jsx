import { useState, useEffect } from 'react'
import { api, fileUrl } from '../lib/api'

const HEAD_COACH = {
  name: 'Mahmoud Moharam',
  title: 'Head Coach',
  initial: 'M',
  photo: `${import.meta.env.BASE_URL}images/mm-padel-coach-moharam.jpg`,
  blurb: 'Mahmoud Moharam heads the coaching team at MM Padel Academy — a coach known for turning strong players into smart ones. He reads the game a split-second early, teaches technique that holds up under pressure, and tailors every session to the player in front of him. From the first footwork drill to match point, his sessions are demanding, precise, and genuinely fun — and every player leaves the court better than they walked in.',
  quote: 'Every rally has a lesson — train with purpose.',
}

export default function Coaches() {
  const [coaches, setCoaches] = useState([])

  useEffect(() => {
    api.get('/users/public/coaches').then(data => setCoaches(Array.isArray(data) ? data : [])).catch(() => {})
  }, [])

  const team = coaches.filter(c => (c.name || '').toLowerCase().replace(/^coach\s+/, '').trim() !== 'mahmoud moharam')

  return (
    <div className="min-h-screen bg-theme text-theme py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-12">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <span className="text-xs font-extrabold uppercase tracking-widest text-brand-text">Our Team</span>
          <h1 className="font-heading text-3xl sm:text-4xl font-extrabold text-theme">Meet the Coaches</h1>
          <p className="text-muted text-sm">
            Certified padel coaches guiding every level — from first rally to competitive play.
          </p>
        </div>

        {/* Head Coach */}
        <div className="glass-card rounded-2xl p-6 sm:p-10 max-w-3xl mx-auto text-center space-y-5 border border-gold/40">
          <div className="relative w-32 h-32 mx-auto">
            <div className="w-32 h-32 rounded-full bg-gold/15 border-4 border-gold/50 shadow-lg shadow-gold/10 flex items-center justify-center text-gold text-5xl font-black font-heading overflow-hidden">
              {HEAD_COACH.photo ? (
                <img
                  src={HEAD_COACH.photo}
                  alt="Captain Mahmoud Moharam"
                  className="w-full h-full object-cover object-[center_15%]"
                />
              ) : (
                HEAD_COACH.initial
              )}
            </div>
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gold text-slate-950 text-[10px] font-extrabold uppercase tracking-wider shadow whitespace-nowrap">
              Head Coach
            </span>
          </div>
          <div>
            <h2 className="font-heading text-2xl font-extrabold text-theme">{HEAD_COACH.name}</h2>
            <p className="text-xs font-bold text-gold uppercase tracking-wider mt-1">{HEAD_COACH.title} · MM Padel Academy</p>
          </div>
          <p className="text-sm text-muted leading-relaxed max-w-2xl mx-auto">{HEAD_COACH.blurb}</p>
          <p className="font-heading text-base sm:text-lg font-bold text-brand-text italic">&ldquo;{HEAD_COACH.quote}&rdquo;</p>
        </div>

        {/* Coaching team */}
        {team.length > 0 && (
          <div className="space-y-8">
            <div className="text-center space-y-2">
              <h2 className="font-heading text-2xl sm:text-3xl font-extrabold text-theme">The Coaching Team</h2>
              <p className="text-muted text-sm">Specialists in technique, tactics, and training for every level.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-4xl mx-auto">
              {team.map(member => (
                <div key={member.id} className="glass-card rounded-2xl p-6 text-center space-y-4 group transition-transform hover:-translate-y-1">
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
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
