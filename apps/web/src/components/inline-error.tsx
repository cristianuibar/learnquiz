import { useEffect, useRef, useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'

// Server validation failures arrive as a JSON-stringified zod issues array.
function issuesOf(err: unknown) {
  if (!(err instanceof Error)) return null
  try {
    const issues: unknown = JSON.parse(err.message)
    const ok = Array.isArray(issues) && issues.length > 0 && issues.every((i) => i && typeof i.message === 'string' && Array.isArray(i.path))
    return ok ? (issues as { message: string; path: unknown[] }[]) : null
  } catch {
    return null
  }
}

export function fieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { message, path } of issuesOf(err) ?? []) {
    if (path.length && !(String(path[0]) in out)) out[String(path[0])] = message
  }
  return out
}

export const errorMessage = (err: unknown, fallback = 'Something went wrong') =>
  typeof navigator !== 'undefined' && navigator.onLine === false
    ? "You're offline"
    : issuesOf(err)?.[0].message || (err instanceof Error && err.message) || fallback

// After a failed submit, moves focus to the form's first field marked aria-invalid.
export function useFocusInvalid(fields: Record<string, string>) {
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [fields])
  return ref
}

export function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3">
      <p className="text-sm font-medium text-wrong">{message}</p>
      <Button variant="secondary" className="px-6" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

// 401 and 403 can never succeed on retry for the same account, so they offer a way out instead.
function PermissionError({ message }: { message: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <div role="alert" className="flex flex-col gap-3">
      <p className="text-sm font-medium text-wrong">{message}</p>
      <div className="flex flex-wrap gap-3">
        <Button asChild className="px-6">
          <Link to="/today">Go to Today</Link>
        </Button>
        <Button
          variant="secondary"
          className="px-6"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError('')
            const redirect = router.state.location.href
            // Offline, signOut rejects instead of resolving with an error; both must re-enable the button.
            const { error } = await authClient.signOut().catch(() => ({ error: { message: 'Could not sign out' } }))
            if (error) {
              setError(error.message ?? 'Could not sign out')
              setBusy(false)
              return
            }
            await router.invalidate()
            await router.navigate({ to: '/sign-in', search: { redirect } })
          }}
        >
          Sign in as someone else
        </Button>
      </div>
      {error && <p className="text-sm font-medium text-wrong">{error}</p>}
    </div>
  )
}

export function RouteError({ error, reset }: { error: unknown; reset: () => void }) {
  const router = useRouter()
  const status = (error as { status?: unknown } | null)?.status
  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-8">
      {status === 401 || status === 403 ? (
        <PermissionError message={errorMessage(error)} />
      ) : (
        <InlineError
          message={errorMessage(error)}
          onRetry={() => {
            reset()
            void router.invalidate()
          }}
        />
      )}
    </main>
  )
}
