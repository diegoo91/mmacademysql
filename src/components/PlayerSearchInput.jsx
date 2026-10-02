import { useState, useEffect, useRef, useId } from 'react'
import { api } from '../lib/api'

export default function PlayerSearchInput({ value, onChange, onPlayerSelect, placeholder, strict, endpoint, minChars = 3 }) {
  const [query, setQuery] = useState(value || '')
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [status, setStatus] = useState('') // '' | 'loading' | 'empty' | 'error'
  const wrapRef = useRef(null)
  const debounceRef = useRef(null)
  const listId = useId()

  useEffect(() => { setQuery(value || '') }, [value])

  useEffect(() => {
    const handleClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const fetchSuggestions = (q) => {
    if (q.length < minChars) { setSuggestions([]); setStatus(''); return }
    setStatus('loading')
    const url = endpoint
      ? `${endpoint}${encodeURIComponent(q)}`
      : `/users?role=player&search=${encodeURIComponent(q)}&limit=10`
    api.get(url).then(data => {
      const list = (data.players || []).map(p => ({ ...p, full_name: p.full_name || p.name }))
      setSuggestions(list)
      setStatus(list.length > 0 ? '' : 'empty')
      setOpen(true)
    }).catch(() => {
      setSuggestions([])
      setStatus('error')
      setOpen(true)
    })
  }

  const handleInput = (val) => {
    setQuery(val)
    onChange(val)
    setActiveIdx(-1)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 250)
  }

  const selectName = (name, player) => {
    if (strict) {
      setQuery(name)
      onChange(name)
      setOpen(false)
      if (onPlayerSelect && player) onPlayerSelect(player)
      return
    }
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
    if (strict) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, -1)) }
      else if (e.key === 'Enter' && activeIdx >= 0 && activeIdx < suggestions.length) {
        e.preventDefault()
        selectName(suggestions[activeIdx].full_name, suggestions[activeIdx])
      }
      else if (e.key === 'Escape') setOpen(false)
      return
    }
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
  const showAddNew = !strict && query.length >= minChars && !items.some(n => n.toLowerCase() === query.toLowerCase())
  const showStatus = query.length >= minChars && (status === 'empty' || status === 'error')
  const panelOpen = open && (suggestions.length > 0 || showAddNew || showStatus)

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={panelOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={panelOpen && activeIdx >= 0 ? `${listId}-opt-${activeIdx}` : undefined}
        aria-label={placeholder || 'Search players'}
        value={query}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => query.length >= minChars && (suggestions.length > 0 || showAddNew || showStatus) && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || 'e.g. Zain'}
        className="w-full px-3 py-2 rounded-xl bg-surface border border-theme text-theme text-xs"
      />
      {panelOpen && (
        <div id={listId} role="listbox" aria-label="Player suggestions" className="absolute z-50 top-full left-0 right-0 mt-1 bg-surface border border-theme rounded-xl shadow-xl max-h-48 overflow-y-auto">
          {showStatus && (
            <p role={status === 'error' ? 'alert' : undefined} className="px-3 py-2.5 text-xs text-muted">
              {status === 'error'
                ? "Couldn't search members — check your connection and try again."
                : <>No members match <span className="font-semibold text-theme">“{query}”</span> — check the spelling.</>}
            </p>
          )}
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              id={`${listId}-opt-${i}`}
              type="button"
              role="option"
              aria-selected={i === activeIdx}
              onClick={() => selectName(s.full_name, s)}
              className={`w-full text-left px-3 py-2 text-xs ${i === activeIdx ? 'bg-brand/10 text-brand-text' : 'text-theme hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              {s.full_name}
            </button>
          ))}
          {showAddNew && (
            <button
              type="button"
              role="option"
              aria-selected={activeIdx === suggestions.length}
              onClick={addNewPlayer}
              className={`w-full text-left px-3 py-2 text-xs border-t border-theme ${activeIdx === suggestions.length ? 'bg-brand/10 text-brand-text' : 'text-muted italic hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              Add '{query}' as new player
            </button>
          )}
        </div>
      )}
    </div>
  )
}
