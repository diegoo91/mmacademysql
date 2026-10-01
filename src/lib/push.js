import { api } from './api'

let swPromise = null

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null)
  if (swPromise) return swPromise
  // Resolve against the app base, not the current page — on a deep link like
  // /admin/payments a relative './sw.js' would 404 at /admin/sw.js.
  const base = import.meta.env.BASE_URL || '/'
  swPromise = navigator.serviceWorker.register(`${base}sw.js`, { scope: base })
    .then((reg) => reg)
    .catch((err) => {
      console.warn('Service worker registration failed:', err)
      return null
    })
  return swPromise
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

export function isStandalone() {
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true
  } catch { /* ignore */ }
  // iOS Safari exposes navigator.standalone; Android/Chrome use the media query above.
  return window.navigator.standalone === true
}

export function isIOS() {
  const ua = window.navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua)) return true
  // iPadOS 13+ masquerades as macOS but is touch-capable
  return /Macintosh/.test(ua) && Number(window.navigator.maxTouchPoints || 0) > 1
}

// iOS only delivers Web Push to apps launched from the Home Screen.
export function needsA2HS() {
  return isIOS() && !isStandalone()
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined'
}

export async function getPushStatus() {
  if (!pushSupported()) return { enabled: false, subscribed: false, supported: false }
  try {
    const s = await api.get('/push/status')
    return { ...s, supported: true, permission: Notification.permission }
  } catch {
    return { enabled: false, subscribed: false, supported: true }
  }
}

export async function enablePushNotifications() {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' }
  if (needsA2HS()) return { ok: false, reason: 'a2hs' }

  const reg = await registerServiceWorker()
  if (!reg) return { ok: false, reason: 'no-sw' }

  let permission = typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  if (permission === 'default') {
    permission = await Notification.requestPermission()
  }
  if (permission !== 'granted') return { ok: false, reason: 'denied' }

  try {
    const keyRes = await api.get('/push/vapid-public-key')
    if (!keyRes.enabled || !keyRes.publicKey) return { ok: false, reason: 'not-configured' }

    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey),
      })
    }
    await api.post('/push/subscribe', sub.toJSON())
    return { ok: true }
  } catch (err) {
    console.warn('Push subscribe failed:', err)
    return { ok: false, reason: 'error', error: err?.message }
  }
}

export async function disablePushNotifications() {
  if (!pushSupported()) return { ok: false }
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager?.getSubscription()
    if (sub) {
      await api.post('/push/unsubscribe', { endpoint: sub.endpoint })
      await sub.unsubscribe()
    }
    return { ok: true }
  } catch (err) {
    console.warn('Push unsubscribe failed:', err)
    return { ok: false }
  }
}
