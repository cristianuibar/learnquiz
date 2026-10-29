import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-client'

// Email and password sign-up or sign-in. A given `email` is locked (invite links). A guest session is linked by Better Auth, so guest data follows the account.
export function CredentialsForm({ email, name, initial = 'up', onDone }: { email?: string; name?: string; initial?: 'up' | 'in'; onDone: () => Promise<void> }) {
  const [mode, setMode] = useState(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const up = mode === 'up'

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const creds = { email: String(f.get('email')).trim(), password: String(f.get('password')) }
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
      } else setError(error.message ?? 'Something went wrong')
      return
    }
    try {
      await onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
    setBusy(false)
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={submit}>
      {up && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" className="h-11" defaultValue={name} autoComplete="name" maxLength={80} required />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" className="h-11" defaultValue={email} readOnly={Boolean(email)} autoComplete="email" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          className="h-11"
          autoComplete={up ? 'new-password' : 'current-password'}
          minLength={8}
          maxLength={128}
          required
        />
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-wrong">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" className="h-11" onClick={() => setMode(up ? 'in' : 'up')}>
          {up ? 'I have an account' : 'Create an account'}
        </Button>
        <Button type="submit" className="h-11 px-6" disabled={busy}>
          {up ? 'Sign up' : 'Sign in'}
        </Button>
      </div>
    </form>
  )
}
