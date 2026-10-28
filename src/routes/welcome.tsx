import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { errorMessage } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { sitePath } from '@/lib/utils'
import { acceptDisclosure } from '@/server/session-fn'

export const Route = createFileRoute('/welcome')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({ redirect: sitePath(search.redirect) }),
  beforeLoad: ({ context }) => {
    if (!context.needsDisclosure) throw redirect({ to: '/' })
  },
  component: Welcome,
})

const points = [
  ['What the app records', 'Your answers, how sure you were, how long each answer took, and your progress.'],
  ['Who sees it', "You and your company's admins."],
  ['What it is for', 'Your training and development.'],
  ['What it never does', 'Read your camera, your sensors or your health data.'],
]

function Welcome() {
  const router = useRouter()
  const { redirect: next = '/' } = Route.useSearch()
  const accept = useServerFn(acceptDisclosure)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError('')
    try {
      await accept()
      await router.invalidate()
      router.history.push(next)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-8 pb-16">
      <h1 className="text-3xl font-bold tracking-tight">Before you start</h1>
      <dl className="mt-8 flex flex-col gap-6">
        {points.map(([term, text]) => (
          <div key={term}>
            <dt className="font-semibold">{term}</dt>
            <dd className="mt-1">{text}</dd>
          </div>
        ))}
      </dl>
      {error && (
        <p role="alert" className="mt-6 text-sm font-medium text-wrong">
          {error}
        </p>
      )}
      <Button className="mt-8 h-11 px-6" onClick={submit} disabled={busy}>
        Got it
      </Button>
    </main>
  )
}
