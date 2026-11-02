import { Link, createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/me/')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/' })
  },
  component: Me,
})

function Me() {
  const { user, adminCompanies } = Route.useRouteContext()
  const router = useRouter()

  async function signOut() {
    await authClient.signOut()
    await router.invalidate()
    await router.navigate({ to: '/' })
  }

  if (!user) return null
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pt-8 pb-8">
      <h1 className="text-3xl font-bold tracking-tight">{user.isAnonymous ? 'Guest' : user.name}</h1>
      {adminCompanies.length > 0 && (
        <ul className="flex flex-col gap-3">
          {adminCompanies.map((company) => (
            <li key={company.slug}>
              <Button asChild variant="outline" className="h-12 px-6">
                <Link to="/org/$slug" params={{ slug: company.slug }}>{company.name} portal</Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {!user.isAnonymous && (
        <Button variant="outline" className="h-12 w-full px-6 sm:w-auto sm:self-start" onClick={signOut}>
          Sign out
        </Button>
      )}
    </main>
  )
}
