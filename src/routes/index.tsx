import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    if (context.user) throw redirect({ to: '/start' })
  },
  component: Landing,
})

function Landing() {
  const { facebookEnabled } = Route.useRouteContext()
  const router = useRouter()
  const [topic, setTopic] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const search = topic.trim() ? { topic: topic.trim() } : {}

  async function guest() {
    setBusy(true)
    setError('')
    const { error } = await authClient.signIn.anonymous()
    if (error) {
      setError(error.message ?? 'Could not sign in')
      setBusy(false)
      return
    }
    await router.invalidate()
    await router.navigate({ to: '/start', search })
  }

  async function facebook() {
    setBusy(true)
    setError('')
    const { error } = await authClient.signIn.social({
      provider: 'facebook',
      callbackURL: `/start${topic.trim() ? `?topic=${encodeURIComponent(topic.trim())}` : ''}`,
    })
    if (error) {
      setError(error.message ?? 'Could not sign in')
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-8 px-4 pt-16 pb-16">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Quiz it, until you learn it</h1>
      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault()
          router.navigate({ to: '/start', search })
        }}
      >
        <Input
          aria-label="What do you want to learn?"
          placeholder="What do you want to learn?"
          className="h-12"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          maxLength={200}
        />
        <Button type="submit" className="h-12 px-6" disabled={busy}>
          Start
        </Button>
      </form>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="outline" className="h-12 px-6" onClick={guest} disabled={busy}>
          Continue as guest
        </Button>
        {facebookEnabled && (
          <Button variant="outline" className="h-12 px-6" onClick={facebook} disabled={busy}>
            Continue with Facebook
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-wrong">
          {error}
        </p>
      )}
    </main>
  )
}
