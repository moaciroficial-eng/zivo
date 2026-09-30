/* Service Worker do Terny (PWA).
   Fase atual: torna o app instalável e pronto pra notificações.
   NÃO faz cache de páginas de propósito — o Terny muda todo dia e cache
   velho quebraria o painel. Só repassa as requisições. */

self.addEventListener('install', () => {
  // Ativa a versão nova imediatamente, sem esperar as abas fecharem.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Passthrough — sem cache.
self.addEventListener('fetch', () => {})

/* ── Notificações push (ligadas na Fase 2, quando houver VAPID) ── */
self.addEventListener('push', (event) => {
  if (!event.data) return
  let data = {}
  try { data = event.data.json() } catch { data = { title: 'Terny', body: event.data.text() } }
  const title = data.title || 'Terny'
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/192',
    badge: '/icons/192',
    vibrate: [100, 50, 100],
    tag: data.tag,
    data: { url: data.url || '/dashboard' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const alvo = (event.notification.data && event.notification.data.url) || '/dashboard'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      // Se já tem uma aba do Terny aberta, foca nela.
      for (const c of lista) {
        if ('focus' in c) { c.navigate(alvo); return c.focus() }
      }
      return self.clients.openWindow(alvo)
    })
  )
})
