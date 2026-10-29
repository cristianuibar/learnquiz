import { useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export const errorMessage = (err: unknown) => (err instanceof Error && err.message) || 'Something went wrong'

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
