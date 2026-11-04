import { Eye, EyeOff, Lock } from 'lucide-react'
import { useState } from 'react'
import { errorMessage } from '@/components/inline-error'
import { ErrorRow } from '@/components/question/error-row'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-client'

// Email and password sign-up or sign-in. A given `email` is locked (invite links); `defaultEmail` only prefills. A guest session is linked by Better Auth, so guest data follows the account.
export function CredentialsForm({ email, defaultEmail, name, initial = 'up', onModeChange, onDone, social }: { email?: string; defaultEmail?: string; name?: string; initial?: 'up' | 'in'; onModeChange?: (mode: 'up' | 'in') => void; onDone: () => Promise<void>; social?: React.ReactNode }) {
  const [mode, setModeState] = useState(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState(false)
  const [passwordLength, setPasswordLength] = useState(0)
  const [hasName, setHasName] = useState(Boolean(name?.trim()))
  const up = mode === 'up'
  const ready = up ? passwordLength >= 8 && hasName : passwordLength > 0

  function setMode(next: 'up' | 'in') {
    setModeState(next)
    // The name field remounts with its default value, so its readiness resets with it.
    if (next === 'up') setHasName(Boolean(name?.trim()))
    onModeChange?.(next)
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const creds = { email: String(f.get('email')).trim(), password: String(f.get('password')) }
    if (up && String(f.get('name') ?? '').trim() === '') return setError('Enter your name.')
    if (up && creds.password.length < 8) return setError('Use at least 8 characters for your password.')
    if (!up && creds.password === '') return setError('Enter your password.')
    setBusy(true)
    setError('')
    const { error } = up
      ? await authClient.signUp.email({ ...creds, name: String(f.get('name')).trim() })
      : await authClient.signIn.email(creds)
    if (error) {
      setBusy(false)
      if (up && error.code?.startsWith('USER_ALREADY_EXISTS')) {
        setMode('in')
        setError('This email already has an account. Sign in instead.')
      } else setError(error.message ?? (up ? "Couldn't create your account. Check your connection and try again." : "Couldn't sign you in. Check your connection and try again."))
      return
    }
    try {
      await onDone()
    } catch (err) {
      setError(errorMessage(err, up ? "Couldn't finish creating your account. Reload and try again." : "Couldn't finish signing in. Reload and try again."))
    }
    setBusy(false)
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={email ?? defaultEmail}
            readOnly={Boolean(email)}
            autoComplete="email"
            required
            aria-describedby={email ? 'email-help' : undefined}
            className={email ? 'bg-surface-sunken pr-14' : undefined}
          />
          {email && <Lock className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-ink-muted" aria-hidden />}
        </div>
        {email && (
          <p id="email-help" className="text-caption text-ink-muted">
            Set by your invite
          </p>
        )}
      </div>
      {up && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" defaultValue={name} autoComplete="name" maxLength={80} required onChange={(e) => setHasName(e.target.value.trim() !== '')} />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{up ? 'Create a password' : 'Password'}</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={shown ? 'text' : 'password'}
            autoComplete={up ? 'new-password' : 'current-password'}
            minLength={8}
            maxLength={128}
            required
            aria-describedby={up ? 'password-help' : undefined}
            className="pr-14"
            onChange={(e) => setPasswordLength(e.target.value.length)}
          />
          <button
            type="button"
            aria-label="Show password"
            aria-pressed={shown}
            onClick={() => setShown((v) => !v)}
            className="absolute top-1/2 right-1 flex size-12 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand aria-pressed:bg-brand-tint aria-pressed:text-brand"
          >
            {shown ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
          </button>
        </div>
        {up && (
          <p id="password-help" className="text-caption text-ink-muted">
            At least 8 characters
          </p>
        )}
      </div>
      {error && <ErrorRow message={error} />}
      <Button type="submit" size="lg" className="w-full" disabled={busy || !ready}>
        {up ? 'Create account' : 'Sign in'}
      </Button>
      {social && (
        <>
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" aria-hidden />
            <span className="text-caption text-ink-muted">or</span>
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>
          {social}
        </>
      )}
      <Button type="button" variant="link" className="w-full" onClick={() => setMode(up ? 'in' : 'up')}>
        {up ? 'I already have an account' : 'Create an account'}
      </Button>
    </form>
  )
}
