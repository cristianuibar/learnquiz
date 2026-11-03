// Learn Quiz service worker: app shell and offline page only. Answering needs the network,
// so /api/* and server-function requests are never intercepted or cached.
const CACHE = 'lq-shell-v1'
const SHELL = ['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // Pages: network first; the offline page only when the network is unreachable.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')))
    return
  }

  // Hashed build files never change, so cache first. Everything else (server functions, /api) passes through.
  if (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((cache) => cache.put(request, copy))
            }
            return res
          }),
      ),
    )
  }
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data?.json() ?? {}
  } catch {
    // Even an empty or malformed push must show a user-visible notification.
  }
  event.waitUntil(self.registration.showNotification(payload?.title || 'Learn Quiz', {
    body: payload?.body || 'Ready for a little learning?',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: payload?.url || '/me' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // Only navigate within this app, even if an unexpected payload contains a URL.
  let target = new URL('/me', self.location.origin)
  try {
    const requested = new URL(event.notification.data?.url || '/me', self.location.origin)
    if (requested.origin === self.location.origin) target = requested
  } catch {}
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find((client) => client.url === target.href)
    if (existing) return existing.focus()
    return self.clients.openWindow(target.href)
  })())
})
