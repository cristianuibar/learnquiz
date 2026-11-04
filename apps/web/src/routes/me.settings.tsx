import { useEffect, useState } from 'react'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { canToggleDay, timeOptions } from '@learnquiz/api/settings'
import { formatMinute } from '@learnquiz/api/schedule'
import { AccountRows } from '@/components/settings/account-rows'
import { AppearanceControl, type Theme } from '@/components/settings/appearance-control'
import { DaysToggles } from '@/components/settings/days-toggles'
import { HoursField } from '@/components/settings/hours-field'
import { PushSwitch } from '@/components/settings/push-switch'
import { errorMessage, RouteError } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { enableWebPush, needsHomeScreen } from '@/lib/web-push'
import { getPushSettings, savePushPreferences, sendTestPush } from '@/server/push'

export const Route = createFileRoute('/me/settings')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/' })
    if (context.user.isAnonymous) throw redirect({ to: '/me' })
  },
  loader: () => getPushSettings(),
  errorComponent: RouteError,
  component: Settings,
})

const SAVE_ERROR = 'Couldn’t save your changes. Try again.'
const THEME_KEY = 'lq-theme'
const alertClass = 'rounded-lg bg-surface-sunken px-4 py-3 text-body text-ink'
const h2 = 'text-title-2 text-ink'

function applyTheme(theme: Theme) {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.dataset.theme = theme
  try {
    if (theme === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, theme)
  } catch { /* storage unavailable */ }
}

function Settings() {
  const { user, adminCompanies } = Route.useRouteContext()
  const push = Route.useLoaderData()
  const router = useRouter()
  const email = authClient.useSession().data?.user.email ?? null
  const { company, publicKey, isStaff } = push
  // Grows when this browser subscribes, so the new subscription counts as this account's.
  const [endpoints, setEndpoints] = useState(push.endpoints)
  const [prefs, setPrefs] = useState(push.prefs)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [dayNotice, setDayNotice] = useState('')
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [theme, setTheme] = useState<Theme>('system')
  const [testMessage, setTestMessage] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY)
      if (stored === 'light' || stored === 'dark') setTheme(stored)
    } catch { /* storage unavailable */ }
  }, [])

  const pushSupported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !needsHomeScreen()

  useEffect(() => {
    if (!pushSupported()) return
    let active = true
    navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).then((registration) => registration.pushManager.getSubscription()).then((current) => {
      if (active) setSubscription(current)
    }).catch(() => {})
    return () => { active = false }
  }, [])

  const saved = Boolean(subscription && endpoints.includes(subscription.endpoint))

  async function save(next: typeof prefs, before?: () => Promise<void>) {
    const previous = prefs
    setSaveError(false)
    setDayNotice('')
    setSaving(true)
    setPrefs(next)
    try {
      await before?.()
      await savePushPreferences({ data: next })
    } catch {
      setPrefs(previous)
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  function toggleSwitch(on: boolean) {
    if (!on) return void save({ ...prefs, paused: true })
    const enable = pushSupported() && publicKey && !saved
      ? async () => {
        const current = await enableWebPush(publicKey, endpoints)
        setSubscription(current)
        setEndpoints((known) => known.includes(current.endpoint) ? known : [...known, current.endpoint])
      }
      : undefined
    void save({ ...prefs, paused: false }, enable)
  }

  function toggleDay(day: number) {
    if (!canToggleDay(prefs.days, day)) return setDayNotice('At least one day')
    const days = prefs.days.includes(day) ? prefs.days.filter((d) => d !== day) : [...prefs.days, day].sort((a, b) => a - b)
    void save({ ...prefs, days })
  }

  async function sendTest() {
    setTestMessage(null)
    setTestError(null)
    try {
      await sendTestPush({ data: { endpoint: subscription!.endpoint } })
      setTestMessage('Test push accepted. Check your device for the notification.')
    } catch (e) {
      setTestError(errorMessage(e, 'Could not send the test push. Try again.'))
    }
  }

  async function signOut() {
    setSigningOut(true)
    setSignOutError(null)
    const { error } = await authClient.signOut().catch(() => ({ error: true }))
    if (error) {
      setSignOutError('Couldn’t sign out. Try again.')
      setSigningOut(false)
      return
    }
    await router.invalidate()
    await router.navigate({ to: '/' })
  }

  if (!user) return null
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-8 px-4 pt-6 pb-8">
      <header className="flex items-center gap-2">
        <Link to="/me/profile" aria-label="Back" className="-ml-3 inline-flex size-12 items-center justify-center rounded-full text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          <ChevronLeft aria-hidden className="size-6" />
        </Link>
        <h1 tabIndex={-1} className="text-title-1 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Settings</h1>
      </header>
      <section aria-labelledby="settings-learning" className="flex flex-col gap-4">
        <h2 id="settings-learning" className={h2}>Learning questions</h2>
        <PushSwitch checked={!prefs.paused} disabled={saving} onChange={toggleSwitch} />
        <HoursField
          start={prefs.startMinute}
          end={prefs.endMinute}
          startOptions={timeOptions(company, 0, prefs.endMinute - 30)}
          endOptions={timeOptions(company, prefs.startMinute + 30, 1440)}
          caption={company && `Inside ${company.name}’s hours: ${formatMinute(company.startMinute)}–${formatMinute(company.endMinute)}`}
          disabled={saving}
          onStart={(startMinute) => void save({ ...prefs, startMinute })}
          onEnd={(endMinute) => void save({ ...prefs, endMinute })}
        />
        <DaysToggles available={company?.days ?? [1, 2, 3, 4, 5, 6, 7]} days={prefs.days} disabled={saving} notice={dayNotice} onToggle={toggleDay} />
        {saveError && <p role="alert" className={alertClass}>{SAVE_ERROR}</p>}
        {isStaff && (
          <>
            <Button variant="secondary" className="self-start" disabled={!saved} onClick={() => void sendTest()}>Send test push</Button>
            {testMessage && <p role="status" className="text-body text-ink">{testMessage}</p>}
            {testError && <p role="alert" className={alertClass}>{testError}</p>}
          </>
        )}
      </section>
      <section aria-labelledby="settings-appearance" className="flex flex-col gap-4">
        <h2 id="settings-appearance" className={h2}>Appearance</h2>
        <AppearanceControl value={theme} onChange={(next) => { setTheme(next); applyTheme(next) }} />
      </section>
      <section aria-labelledby="settings-account" className="flex flex-col gap-4">
        <h2 id="settings-account" className={h2}>Account</h2>
        <AccountRows email={email} companies={adminCompanies} isAdmin={user.role === 'admin'} signingOut={signingOut} error={signOutError} onSignOut={() => void signOut()} />
      </section>
    </main>
  )
}
