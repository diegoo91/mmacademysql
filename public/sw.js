/* MM Padel Academy service worker — Web Push + notification click handling */
const ICON = new URL('./images/icon-192.png', self.registration.scope).href
const BADGE = new URL('./images/icon-192.png', self.registration.scope).href

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

function parsePayload(event) {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    try { data = { body: event.data ? event.data.text() : '' } } catch { data = {} }
  }
  return {
    title: data.title || 'MM Padel Academy',
    body: data.body || '',
    url: data.url || './',
    kind: data.kind || 'info',
    tag: data.tag || undefined,
  }
}

self.addEventListener('push', (event) => {
  const p = parsePayload(event)
  event.waitUntil(
    self.registration.showNotification(p.title, {
      body: p.body,
      icon: ICON,
      badge: BADGE,
      tag: p.tag,
      renotify: false,
      requireInteraction: false,
      data: { url: p.url, kind: p.kind },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || './'
  const url = new URL(target, self.registration.scope).href

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of all) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) await client.navigate(url)
          return
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url)
    })()
  )
})
