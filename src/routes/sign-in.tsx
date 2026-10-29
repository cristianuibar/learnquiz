import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { CredentialsForm } from '@/components/credentials-form'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { sitePath } from '@/lib/utils'

export const Route = createFileRoute('/sign-in')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({ redirect: sitePath(search.redirect) }),
  beforeLoad: ({ context }) => {
    if (context.user && !context.user.isAnonymous) throw redirect({ to: '/' })
  },
  component: SignIn,
})

function SignIn() {
  const { facebookEnabled } = Route.useRouteContext()
  const { redirect: next = '/' } = Route.useSearch()
  const router = useRouter()

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pt-8 pb-16">
      <h1 className="text-3xl font-bold tracking-tight">Sign in</h1>
      <CredentialsForm
        initial="in"
        onDone={async () => {
          await router.navigate({ href: next })
          await router.invalidate()
        }}
      />
      {facebookEnabled && (
        <Button variant="outline" className="h-11 px-6" onClick={() => authClient.signIn.social({ provider: 'facebook', callbackURL: next })}>
          Continue with Facebook
        </Button>
      )}
    </main>
  )
}
