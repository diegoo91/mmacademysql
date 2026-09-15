import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'

export default function PlayerSearchInput({ value, onChange, onPlayerSelect, placeholder }) {
  const [query, setQuery] = useState(value || '')
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const wrapRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => { setQuery(value || '') }, [value])

  useEffect(() => {
    const handleClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const fetchSuggestions = (q) => {
    if (q.length < 3) { setSuggestions([]); return }
    api.get(`/players?search=${encodeURIComponent(q)}&limit=10`).then(data => {
      setSuggestions(data.players || [])
      setOpen(true)
    }).catch(() => setSuggestions([]))
  }

  const handleInput = (val) => {
    setQuery(val)
    onChange(val)
    setActiveIdx(-1)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 250)
  }

  const selectName = (name, player) => {
    const parts = query.split(/[/+]/)
    parts[parts.length - 1] = name
    const newVal = parts.join(query.includes('/') ? ' / ' : ' + ')
    setQuery(newVal)
    onChange(newVal)
    setOpen(false)
    if (onPlayerSelect && player) onPlayerSelect(player)
  }

  const addNewPlayer = () => { setOpen(false) }

  const handleKeyDown = (e) => {
    const items = [...suggestions, { full_name: `Add '${query}' as new player` }]
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, -1)) }
    else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      if (activeIdx < suggestions.length) selectName(suggestions[activeIdx].full_name, suggestions[activeIdx])
      else addNewPlayer()
    }
    else if (e.key === 'Escape') setOpen(false)
  }

  const items = suggestions.map(s => s.full_name)
  const showAddNew = query.length >= 3 && !items.some(n => n.toLowerCase() === query.toLowerCase())

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => query.length >= 3 && (suggestions.length > 0 || showAddNew) && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || 'e.g. Zain'}
        className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs"
      />
      {open && (suggestions.length > 0 || showAddNew) && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-surface border border-theme rounded-xl shadow-xl max-h-48 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectName(s.full_name, s)}
              className={`w-full text-left px-3 py-2 text-xs ${i === activeIdx ? 'bg-lime-400/10 text-lime-400' : 'text-theme hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              {s.full_name}
            </button>
          ))}
          {showAddNew && (
            <button
              type="button"
              onClick={addNewPlayer}
              className={`w-full text-left px-3 py-2 text-xs border-t border-theme ${activeIdx === suggestions.length ? 'bg-lime-400/10 text-lime-400' : 'text-muted italic hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              Add '{query}' as new player
            </button>
          )}
        </div>
      )}
    </div>
  )
}
