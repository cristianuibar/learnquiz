import { useEffect, useRef } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

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

export const errorMessage = (err: unknown) =>
  typeof navigator !== 'undefined' && navigator.onLine === false
    ? "You're offline"
    : issuesOf(err)?.[0].message || (err instanceof Error && err.message) || 'Something went wrong'

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
      <Button variant="outline" className="h-12 px-6" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

export function RouteError({ error, reset }: { error: unknown; reset: () => void }) {
  const router = useRouter()
  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-8">
      <InlineError
        message={errorMessage(error)}
        onRetry={() => {
          reset()
          void router.invalidate()
        }}
      />
    </main>
  )
}
