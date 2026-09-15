const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5174/api'
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '')

export function fileUrl(path) {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${API_ORIGIN}${path}`
}

let accessToken = null

function getToken() {
  if (accessToken) return accessToken
  try {
    const saved = sessionStorage.getItem('mm_padel_token')
    if (saved) { accessToken = saved; return saved }
  } catch {}
  return null
}

export function setToken(token) {
  accessToken = token
  try { sessionStorage.setItem('mm_padel_token', token) } catch {}
}

export function clearToken() {
  accessToken = null
  try { sessionStorage.removeItem('mm_padel_token') } catch {}
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
    if (refreshed) return request(method, path, body, { ...opts, isRetry: true })
    clearToken()
    window.dispatchEvent(new Event('auth:logout'))
    throw new Error('Session expired')
  }

  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}

async function refreshAccessToken() {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!res.ok) return false
    const data = await res.json()
    setToken(data.accessToken)
    return true
  } catch {
    return false
  }
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
  upload: (path, formData) => request('POST', path, formData),
}

export async function login(email, password) {
  const data = await request('POST', '/auth/login', { email, password }, { noRefresh: true })
  setToken(data.accessToken)
  return data.user
}

export async function signup(userData) {
  const data = await request('POST', '/auth/signup', userData, { noRefresh: true })
  setToken(data.accessToken)
  return data.user
}

export async function logout() {
  try { await request('POST', '/auth/logout') } catch {}
  clearToken()
}

export async function getMe() {
  return request('GET', '/auth/me')
}

export async function initAuth() {
  const token = getToken()
  if (!token) return null
  try {
    const data = await getMe()
    return data.user
  } catch {
    clearToken()
    return null
  }
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
