import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { sendTestPush, subscribe, unsubscribe } from '@/server/push'

export function PushSettings({ publicKey, isStaff, endpoints }: { publicKey: string | null; isStaff: boolean; endpoints: string[] }) {
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [ready, setReady] = useState(false)
  const [supported, setSupported] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setSupported(false)
      return
    }
    let active = true
    navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).then((registration) => registration.pushManager.getSubscription()).then((current) => {
      if (!active) return
      setSubscription(current)
      setEnabled(Boolean(current && endpoints.includes(current.endpoint)))
      setReady(true)
    }).catch(() => { if (active) setError('Could not load notification settings. Reload to try again.') })
    return () => { active = false }
  }, [endpoints])

  async function act(action: 'enable' | 'disable' | 'test') {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      if (action === 'enable') {
        // Ask only from the user's click, never on page load.
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') throw new Error('Allow notifications in your browser settings to enable them.')
        const registration = await navigator.serviceWorker.ready
        const applicationServerKey = Uint8Array.from(atob(publicKey!.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
        const current = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
        setSubscription(current)
        const json = current.toJSON()
        await subscribe({ data: { endpoint: current.endpoint, keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth } } })
        setEnabled(true)
        setMessage('Notifications enabled on this browser.')
      } else if (action === 'disable' && subscription) {
        await unsubscribe({ data: { endpoint: subscription.endpoint } })
        setEnabled(false)
        await subscription.unsubscribe()
        setSubscription(null)
        setMessage('Notifications disabled on this browser.')
      } else if (action === 'test' && subscription) {
        await sendTestPush({ data: { endpoint: subscription.endpoint } })
        setMessage('Test push accepted. Check your device for the notification.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update notifications. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="push-heading" className="flex flex-col gap-3">
      <h2 id="push-heading" className="text-xl font-semibold">Notifications</h2>
      <p className="text-sm text-muted-foreground">Enable push notifications on this browser.</p>
      {!supported ? <p>Push notifications are not supported in this browser.</p> : !publicKey ? <p>Push notifications are not configured yet.</p> : (
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" disabled={!ready || busy} onClick={() => void act(enabled ? 'disable' : 'enable')}>
            {busy ? 'Working…' : enabled ? 'Disable notifications' : 'Enable notifications'}
          </Button>
          {isStaff && <Button disabled={!ready || !enabled || busy} onClick={() => void act('test')}>Send test push</Button>}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  )
}
