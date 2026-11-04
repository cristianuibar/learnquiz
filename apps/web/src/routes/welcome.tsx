import { useState } from 'react'
import { createFileRoute, getRouteApi, redirect, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Lock } from 'lucide-react'
import { possessive } from '@learnquiz/api/invite'
import { ErrorRow } from '@/components/question/error-row'
import { Button } from '@/components/ui/button'
import { sitePath } from '@/lib/utils'
import { acceptDisclosure } from '@/server/session-fn'

export const Route = createFileRoute('/welcome')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string; review?: '1' } => ({
    redirect: sitePath(search.redirect),
    review: String(search.review) === '1' ? '1' : undefined,
  }),
  // Settings opens it again with ?review=1 after the disclosure is accepted.
  beforeLoad: ({ context, search }) => {
    if (!context.needsDisclosure && !search.review) throw redirect({ to: '/' })
  },
  component: Welcome,
})

const rootApi = getRouteApi('__root__')
const SAVE_ERROR = "Couldn't save. Check your connection and try again."

function Welcome() {
  const router = useRouter()
  const { redirect: next, review } = Route.useSearch()
  const { needsDisclosure } = Route.useRouteContext()
  const { branding } = rootApi.useLoaderData()
  const accept = useServerFn(acceptDisclosure)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const isReview = review === '1' && !needsDisclosure

  const seenBy = branding?.name ? `You and ${possessive(branding.name)} training admins.` : 'You and your company’s training admins.'

  async function submit() {
    if (isReview) return router.history.back()
    if (busy) return
    setBusy(true)
    setError(false)
    try {
      await accept()
    } catch {
      setError(true)
      setBusy(false)
      return
    }
    await router.navigate({ href: next ?? '/today' })
    await router.invalidate()
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col bg-surface-page px-4 pt-12">
      <div className="flex flex-1 flex-col gap-6 pb-4">
        <h1 tabIndex={-1} className="text-title-1 text-ink">
          Before you start
        </h1>
        <div className="flex flex-col gap-6">
          <section aria-labelledby="d-record" className="flex flex-col gap-1">
            <h2 id="d-record" className="text-label text-ink">
              What we record
            </h2>
            <p className="text-body text-ink">
              Your answers, how sure you were, how long you took, your progress, and anything you type in a reflection or a report note.
            </p>
          </section>
          <section aria-labelledby="d-see" className="flex flex-col gap-1">
            <h2 id="d-see" className="text-label text-ink">
              Who sees it
            </h2>
            <p className="text-body text-ink">{seenBy}</p>
          </section>
          <section aria-labelledby="d-use" className="flex flex-col gap-1">
            <h2 id="d-use" className="text-label text-ink">
              What it’s for
            </h2>
            <p className="text-body text-ink">Your training and development. Nothing else.</p>
          </section>
        </div>
        <section aria-labelledby="d-never" className="flex items-start gap-4 rounded-md bg-surface-sunken p-4">
          <Lock className="mt-px size-6 shrink-0 text-ink-muted" aria-hidden />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id="d-never" className="text-label text-ink">
              Never recorded
            </h2>
            <p className="text-body text-ink">Camera, location, sensors or health data. The microphone only while you record a voice answer.</p>
          </div>
        </section>
        <div>
          <Button asChild variant="link" className="px-0">
            <a href="https://learnquiz.com/privacy" target="_blank" rel="noopener">
              Read the full privacy notice
            </a>
          </Button>
        </div>
      </div>
      <div className="sticky bottom-0 -mx-4 flex flex-col gap-3 bg-surface-page px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {error && <ErrorRow message={SAVE_ERROR} />}
        <Button size="lg" className="w-full" onClick={submit} disabled={busy}>
          Start learning
        </Button>
      </div>
    </main>
  )
}
