import { useEffect, useState } from 'react'
import { errorMessage } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { enableWebPush, needsHomeScreen } from '@/lib/web-push'
import { savePushPreferences, sendTestPush, unsubscribe } from '@/server/push'

type Preferences = { paused: boolean; startMinute: number; endMinute: number; timezone: string }
const time = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
const minutes = (value: string) => { const [hours, mins] = value.split(':').map(Number); return hours * 60 + mins }

export function PushSettings({ publicKey, isStaff, endpoints, prefs, prompt = false }: {
  publicKey: string | null; isStaff: boolean; endpoints: string[]; prefs: Preferences; prompt?: boolean
}) {
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [ready, setReady] = useState(false)
  const [supported, setSupported] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [addToHome, setAddToHome] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [preferences, setPreferences] = useState(prefs)
  const [start, setStart] = useState(time(prefs.startMinute))
  const [end, setEnd] = useState(time(prefs.endMinute))
  const [timezone, setTimezone] = useState(prefs.timezone)

  useEffect(() => {
    if (needsHomeScreen()) {
      setAddToHome(true)
      return
    }
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

  async function act(action: 'enable' | 'disable' | 'test' | 'pause' | 'hours') {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      if (action === 'enable') {
        setSubscription(await enableWebPush(publicKey!, endpoints))
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
      } else if (action === 'pause' || action === 'hours') {
        const next = action === 'pause' ? { ...preferences, paused: !preferences.paused } : {
          ...preferences, startMinute: minutes(start), endMinute: minutes(end), timezone,
        }
        await savePushPreferences({ data: next })
        setPreferences(next)
        setMessage(action === 'hours' ? 'Working hours saved.' : next.paused ? 'Pushes paused on all your devices.' : 'Pushes resumed.')
      }
    } catch (e) {
      setError(errorMessage(e, 'Could not update notifications. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  if (dismissed || (prompt && enabled)) return null
  return (
    <section aria-labelledby="push-heading" className="flex flex-col gap-3">
      <h2 id="push-heading" className="text-xl font-semibold">Notifications</h2>
      <p className="text-sm text-muted-foreground">{prompt ? 'Keep learning with a one-question reminder during your working hours.' : 'Enable push notifications on this browser.'}</p>
      {addToHome ? <div><h3 className="font-semibold">Add to home screen</h3><p>In Safari, tap Share, then Add to Home Screen. Open Learn Quiz from your home screen to enable notifications.</p></div> : !supported ? <p>Push notifications are not supported in this browser.</p> : !publicKey ? <p>Push notifications are not configured yet.</p> : (
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" disabled={!ready || busy} onClick={() => void act(enabled ? 'disable' : 'enable')}>
            {busy ? 'Working…' : enabled ? 'Disable notifications' : 'Enable notifications'}
          </Button>
          {isStaff && !prompt && <Button disabled={!ready || !enabled || busy} onClick={() => void act('test')}>Send test push</Button>}
        </div>
      )}
      {prompt ? <Button variant="ghost" className="self-start" onClick={() => setDismissed(true)}>Not now</Button> : (
        <>
          <Button variant="secondary" className="self-start" disabled={busy} onClick={() => void act('pause')}>
            {preferences.paused ? 'Resume pushes' : 'Pause pushes'}
          </Button>
          <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void act('hours') }}>
            <h3 className="font-semibold">Working hours</h3>
            <p className="text-sm text-muted-foreground">Narrow the window when reminders can arrive. Pushes stay silent outside these hours.</p>
            <div className="flex flex-wrap gap-3">
              <div><Label htmlFor="push-start">From</Label><Input id="push-start" type="time" required value={start} onChange={(event) => setStart(event.target.value)} /></div>
              <div><Label htmlFor="push-end">Until</Label><Input id="push-end" type="time" required value={end} onChange={(event) => setEnd(event.target.value)} /></div>
            </div>
            <Label htmlFor="push-timezone">Timezone</Label>
            <Input id="push-timezone" required value={timezone} maxLength={100} onChange={(event) => setTimezone(event.target.value)} placeholder="Europe/Bucharest" />
            <Button variant="secondary" className="self-start" disabled={busy} type="submit">Save working hours</Button>
          </form>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  )
}
