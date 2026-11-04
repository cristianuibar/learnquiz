import { subscribe } from '@/server/push'

// iOS only delivers web push to a Home Screen app, so a Safari tab has to be added first.
export function needsHomeScreen() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return ios && !(navigator as Navigator & { standalone?: boolean }).standalone && !window.matchMedia('(display-mode: standalone)').matches
}

// Ask only from the user's click, never on page load.
export async function enableWebPush(publicKey: string, endpoints: string[]) {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Allow notifications in your browser settings to enable them.')
  const registration = await navigator.serviceWorker.ready
  const applicationServerKey = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
  let current = await registration.pushManager.getSubscription()
  // A subscription this account has not saved may belong to someone who used this browser before; replace it.
  if (current && !endpoints.includes(current.endpoint)) {
    await current.unsubscribe()
    current = null
  }
  current ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
  const json = current.toJSON()
  await subscribe({ data: { endpoint: current.endpoint, keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth } } })
  return current
}
