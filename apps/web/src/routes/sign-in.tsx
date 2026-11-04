import { useEffect, useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { CredentialsForm } from '@/components/credentials-form'
import { LearnQuizMark } from '@/components/learn-quiz-mark'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { sitePath } from '@/lib/utils'

export const Route = createFileRoute('/sign-in')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string; email?: string; mode?: 'up' } => {
    const email = typeof search.email === 'string' ? search.email.trim() : ''
    return { redirect: sitePath(search.redirect), email: email && email.length <= 254 ? email : undefined, mode: search.mode === 'up' ? 'up' : undefined }
  },
  beforeLoad: ({ context }) => {
    if (context.user && !context.user.isAnonymous) throw redirect({ to: '/' })
  },
  component: SignIn,
})

function SignIn() {
  const { facebookEnabled } = Route.useRouteContext()
  const { redirect: next = '/', email, mode: initial = 'in' } = Route.useSearch()
  const router = useRouter()
  const [mode, setMode] = useState<'up' | 'in'>(initial)
  const heading = mode === 'up' ? 'Create an account' : 'Sign in'

  useEffect(() => {
    const previous = document.title
    document.title = `${heading} · Learn Quiz`
    return () => {
      document.title = previous
    }
  }, [heading])

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pt-8 pb-16">
      <div className="flex items-center gap-2 text-label text-ink">
        <LearnQuizMark className="size-6" />
        <span>Learn Quiz</span>
      </div>
      <h1 className="text-title-1 text-ink">{heading}</h1>
      <CredentialsForm
        initial={initial}
        onModeChange={setMode}
        defaultEmail={email}
        social={
          facebookEnabled ? (
            <Button type="button" variant="secondary" size="lg" className="w-full" onClick={() => authClient.signIn.social({ provider: 'facebook', callbackURL: next })}>
              Continue with Facebook
            </Button>
          ) : undefined
        }
        onDone={async () => {
          await router.navigate({ href: next })
          await router.invalidate()
        }}
      />
    </main>
  )
}
