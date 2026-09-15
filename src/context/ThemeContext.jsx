import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const ThemeContext = createContext()

const THEMES = [
  { id: 'dark', label: 'Dark', accent: 'lime' },
  { id: 'light', label: 'Light', accent: 'lime' },
]

const THEME_CLASSES = {
  dark: '',
  light: 'theme-light',
}

function isDarkTheme(theme) {
  return theme !== 'light'
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem('mm_padel_theme') || 'dark'
    } catch { return 'dark' }
  })

  const applyTheme = useCallback((t) => {
    const targets = [document.documentElement, document.body]
    for (const el of targets) {
      if (!el) continue
      el.classList.remove('dark', 'theme-light')
      if (isDarkTheme(t)) {
        el.classList.add('dark')
      }
      const cls = THEME_CLASSES[t]
      if (cls) el.classList.add(cls)
    }
    document.documentElement.setAttribute('data-theme', isDarkTheme(t) ? 'dark' : 'light')
  }, [])

  const setTheme = useCallback((t) => {
    setThemeState(t)
    try { localStorage.setItem('mm_padel_theme', t) } catch {}
    applyTheme(t)
  }, [applyTheme])

  const toggleTheme = useCallback(() => {
    setTheme(isDarkTheme(theme) ? 'light' : 'dark')
  }, [theme, setTheme])

  useEffect(() => {
    applyTheme(theme)
  }, [])

  const themeMeta = THEMES.find(t => t.id === theme) || THEMES[0]

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, themes: THEMES, themeMeta }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
