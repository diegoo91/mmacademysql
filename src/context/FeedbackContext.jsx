import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, XCircle, Info, X, AlertTriangle } from 'lucide-react'

const FeedbackContext = createContext(null)

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
}

const TOAST_COLORS = {
  success: 'text-emerald-400',
  error: 'text-rose-400',
  info: 'text-brand-text',
  warning: 'text-amber-400',
}

export function FeedbackProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const [toasts, setToasts] = useState([])
  const [inputValue, setInputValue] = useState('')
  const resolveRef = useRef(null)
  const confirmBtnRef = useRef(null)
  const inputRef = useRef(null)
  const toastIdRef = useRef(0)
  const timersRef = useRef([])

  const closeDialog = useCallback((result) => {
    const resolve = resolveRef.current
    resolveRef.current = null
    setDialog(null)
    if (resolve) resolve(result)
  }, [])

  const confirm = useCallback((opts = {}) => new Promise((resolve) => {
    resolveRef.current = resolve
    setDialog({
      mode: 'confirm',
      title: opts.title || 'Are you sure?',
      description: opts.description || '',
      details: opts.details || null,
      confirmLabel: opts.confirmLabel || 'Confirm',
      cancelLabel: opts.cancelLabel || 'Cancel',
      tone: opts.tone || 'default',
    })
  }), [])

  const prompt = useCallback((opts = {}) => new Promise((resolve) => {
    resolveRef.current = resolve
    setDialog({
      mode: 'prompt',
      title: opts.title || 'Enter a value',
      description: opts.description || '',
      details: opts.details || null,
      confirmLabel: opts.confirmLabel || 'Save',
      cancelLabel: opts.cancelLabel || 'Cancel',
      tone: opts.tone || 'default',
      input: {
        label: opts.label || '',
        placeholder: opts.placeholder || '',
        defaultValue: opts.defaultValue || '',
        required: opts.required !== false,
      },
    })
  }), [])

  const toast = useMemo(() => {
    const push = (message, type) => {
      const id = ++toastIdRef.current
      setToasts((list) => [...list.slice(-3), { id, message, type }])
      const timer = setTimeout(() => {
        setToasts((list) => list.filter((t) => t.id !== id))
        timersRef.current = timersRef.current.filter((x) => x !== timer)
      }, 5000)
      timersRef.current.push(timer)
    }
    return {
      info: (message) => push(message, 'info'),
      success: (message) => push(message, 'success'),
      error: (message) => push(message, 'error'),
      warning: (message) => push(message, 'warning'),
    }
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  useEffect(() => () => timersRef.current.forEach(clearTimeout), [])

  useEffect(() => {
    if (!dialog) return
    if (dialog.mode === 'prompt') setInputValue(dialog.input.defaultValue || '')
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeDialog(null) } }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const raf = requestAnimationFrame(() => {
      if (dialog.mode === 'prompt') inputRef.current?.focus()
      else confirmBtnRef.current?.focus()
    })
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      cancelAnimationFrame(raf)
    }
  }, [dialog, closeDialog])

  const value = useMemo(() => ({ confirm, prompt, toast }), [confirm, prompt, toast])

  const toneClass = dialog?.tone === 'danger'
    ? 'bg-rose-500 hover:bg-rose-400 text-white'
    : dialog?.tone === 'success'
      ? 'bg-brand hover:bg-brand-hover text-white'
      : 'bg-brand hover:bg-brand-hover text-white'

  const isPrompt = dialog?.mode === 'prompt'
  const promptInvalid = isPrompt && dialog.input.required && !inputValue.trim()

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      {dialog && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-dialog-title"
          onClick={() => closeDialog(null)}
        >
          <div
            className="bg-surface border border-theme rounded-2xl p-6 max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="feedback-dialog-title" className="text-lg font-bold text-theme mb-2">
              {dialog.title}
            </h3>
            {dialog.description && (
              <p className="text-sm text-muted leading-relaxed whitespace-pre-line mb-4">
                {dialog.description}
              </p>
            )}
            {dialog.details && (
              <div className="text-xs text-muted space-y-1.5 mb-4 rounded-xl bg-slate-100/60 dark:bg-slate-800/50 border border-theme p-3 whitespace-pre-line">
                {dialog.details}
              </div>
            )}
            {isPrompt && (
              <div className="mb-4">
                {dialog.input.label && (
                  <label htmlFor="feedback-dialog-input" className="block text-xs font-semibold text-theme uppercase tracking-wider mb-1.5">
                    {dialog.input.label}
                  </label>
                )}
                <input
                  id="feedback-dialog-input"
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={dialog.input.placeholder}
                  className="w-full px-4 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm focus:outline-none focus:border-brand-text"
                />
              </div>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => closeDialog(null)}
                className="flex-1 py-2.5 rounded-xl bg-surface border border-theme text-theme text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {dialog.cancelLabel}
              </button>
              <button
                ref={confirmBtnRef}
                type="button"
                disabled={promptInvalid}
                onClick={() => closeDialog(isPrompt ? inputValue.trim() : true)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 ${toneClass}`}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="fixed top-4 right-4 z-[400] flex flex-col gap-2 w-[min(24rem,calc(100vw-2rem))]"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info
          return (
            <div
              key={t.id}
              className="flex items-start gap-3 px-4 py-3 rounded-xl bg-slate-900 dark:bg-slate-800 border border-white/10 shadow-2xl"
            >
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${TOAST_COLORS[t.type] || TOAST_COLORS.info}`} />
              <p className="flex-1 text-xs text-white leading-relaxed whitespace-pre-line">{t.message}</p>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss notification"
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </FeedbackContext.Provider>
  )
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext)
  if (!ctx) throw new Error('useFeedback must be used within FeedbackProvider')
  return ctx
}
