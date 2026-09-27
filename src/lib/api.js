const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5174/api'
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '')

export function fileUrl(path) {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${API_ORIGIN}${path}`
}

let accessToken = null
const TOKEN_KEY = 'mm_padel_token'
const REFRESH_KEY = 'mm_padel_refresh'

// Access + refresh tokens live in localStorage (not sessionStorage):
// sessionStorage is reclaimed when a mobile browser backgrounds a tab,
// which used to force a logout on return. localStorage survives that and
// keeps a user signed in for the full refresh-token window (30 days).
function getToken() {
  if (accessToken) return accessToken
  try {
    const saved = localStorage.getItem(TOKEN_KEY)
    if (saved) { accessToken = saved; return saved }
  } catch {}
  return null
}

export function setToken(token) {
  accessToken = token
  try { localStorage.setItem(TOKEN_KEY, token) } catch {}
}

export function clearToken() {
  accessToken = null
  try { localStorage.removeItem(TOKEN_KEY) } catch {}
}

function getRefreshToken() {
  try { return localStorage.getItem(REFRESH_KEY) } catch { return null }
}

function setRefreshToken(token) {
  try {
    if (token) localStorage.setItem(REFRESH_KEY, token)
    else localStorage.removeItem(REFRESH_KEY)
  } catch {}
}

function clearRefreshToken() {
  try { localStorage.removeItem(REFRESH_KEY) } catch {}
}

async function request(method, path, body, opts = {}) {
  const url = `${API_BASE}${path}`
  const headers = { ...opts.headers }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const config = { method, headers, credentials: 'include' }

  if (body instanceof FormData) {
    config.body = body
  } else if (body) {
    headers['Content-Type'] = 'application/json'
    config.body = JSON.stringify(body)
  }

  const res = await fetch(url, config)
  const data = await res.json().catch(() => null)

  if (res.status === 401 && !opts.isRetry && !opts.noRefresh) {
    const refreshed = await refreshAccessToken()
    if (refreshed.ok) return request(method, path, body, { ...opts, isRetry: true })
    clearToken()
    if (refreshed.fatal) clearRefreshToken()
    window.dispatchEvent(new Event('auth:logout'))
    throw new Error('Session expired')
  }

  if (!res.ok) {
    const message = data?.error || data?.code || `Request failed (${res.status})`
    const err = new Error(message)
    err.status = res.status
    err.code = data?.code
    err.data = data
    throw err
  }
  return data
}

async function refreshAccessToken() {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      // Send the refresh token in the body: on mobile the httpOnly cookie
      // is often blocked in cross-site contexts (github.io -> API domain),
      // which silently broke refresh and forced a logout.
      body: JSON.stringify({ refreshToken: getRefreshToken() || undefined }),
    })
    if (res.ok) {
      const data = await res.json()
      setToken(data.accessToken)
      setRefreshToken(data.refreshToken)
      return { ok: true, fatal: false }
    }
    // 401/403 means the refresh token was definitively rejected -> discard it.
    // Anything else (offline, 5xx) is transient -> keep the token so the
    // 30-day session survives a flaky connection.
    const fatal = res.status === 401 || res.status === 403
    if (fatal) clearRefreshToken()
    return { ok: false, fatal }
  } catch {
    return { ok: false, fatal: false }
  }
}

function decodeTokenExp(token) {
  try {
    const json = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof json.exp === 'number' ? json.exp * 1000 : null
  } catch {
    return null
  }
}

// When a tab returns from the background (or is restored from the back/forward
// cache on iOS), silently renew the session before the next API call. This is
// what previously surfaced on mobile as "it logged me out".
async function refreshIfExpiring() {
  if (!getRefreshToken()) return
  const exp = decodeTokenExp(getToken() || '')
  if (exp && exp - Date.now() > 60_000) return
  await refreshAccessToken()
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshIfExpiring()
  })
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) refreshIfExpiring()
  })
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
  upload: (path, formData) => request('POST', path, formData),
}

export async function login(email, password) {
  const data = await request('POST', '/auth/login', { email, password }, { noRefresh: true })
  setToken(data.accessToken)
  setRefreshToken(data.refreshToken)
  return data.user
}

export async function signup(userData) {
  const data = await request('POST', '/auth/signup', userData, { noRefresh: true })
  setToken(data.accessToken)
  setRefreshToken(data.refreshToken)
  return data.user
}

export async function logout() {
  try {
    await request('POST', '/auth/logout', { refreshToken: getRefreshToken() || undefined }, { noRefresh: true })
  } catch {}
  clearToken()
  clearRefreshToken()
}

export async function getMe() {
  return request('GET', '/auth/me')
}

export async function initAuth() {
  const token = getToken()
  // If we have an access token, try /me first
  if (token) {
    try {
      const data = await getMe()
      return data.user
    } catch {
      clearToken()
    }
  }
  // Either no access token or /me failed — try refresh (localStorage body + cookie)
  try {
    const refreshed = await refreshAccessToken()
    if (refreshed.ok) {
      const data = await getMe()
      return data.user
    }
    if (refreshed.fatal) clearRefreshToken()
  } catch { /* ignore */ }
  clearToken()
  return null
}

export async function downloadFile(path) {
  const url = `${API_BASE}${path}`
  const headers = {}
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(url, { credentials: 'include', headers })
  if (!res.ok) throw new Error('Download failed')
  return res.blob()
}
