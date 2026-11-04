import { useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { errorMessage, RouteError } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { plural } from '@/lib/utils'
import { listUsers, setUserBan } from '@/server/admin'

export const Route = createFileRoute('/admin/users')({
  validateSearch: z.object({ search: z.string().max(200).catch(''), field: z.enum(['email', 'name']).catch('email'), offset: z.number().int().min(0).catch(0) }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listUsers({ data: deps }),
  errorComponent: RouteError,
  component: Users,
})

function Users() {
  const { users, total } = Route.useLoaderData()
  const { staff } = Route.useRouteContext()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function changeBan(userId: string, banned: boolean, reason?: string) {
    setBusy(true)
    setError('')
    try {
      await setUserBan({ data: { userId, banned, reason } })
      await router.invalidate()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main>
      <h1 className="text-title-1 text-ink">Users</h1>
      <form className="mt-8 flex flex-wrap items-end gap-3" onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        void navigate({ search: { search: String(form.get('search')).trim(), field: form.get('field') === 'name' ? 'name' : 'email', offset: 0 } })
      }}>
        <div className="flex min-w-0 flex-1 basis-64 flex-col gap-2"><Label htmlFor="user-search">Search users</Label><Input id="user-search" name="search" defaultValue={search.search} maxLength={200} /></div>
        <div className="flex flex-col gap-2"><Label htmlFor="search-field">Search by</Label><select id="search-field" name="field" defaultValue={search.field} className="min-h-12 rounded-md border-2 border-border-strong bg-surface-card px-4 text-body-lg"><option value="email">Email</option><option value="name">Name</option></select></div>
        <Button type="submit">Search</Button>
      </form>
      {error && <p role="alert" className="mt-4 font-medium text-wrong">{error}</p>}
      <p role="status" className="mt-6">{plural(total, 'user', 'users')} found</p>
      {users.length === 0 && (search.offset > 0
        ? <p className="mt-4">No users on this page. <Link to="/admin/users" search={{ ...search, offset: 0 }} className="inline-flex min-h-11 items-center rounded-md underline focus-visible:ring-[3px] focus-visible:ring-ring/50">Go to page 1</Link></p>
        : <p className="mt-4">{search.search ? 'No users match this search. Try another name or email.' : 'No users have signed up yet.'}</p>)}
      <ul className="mt-4 flex flex-col gap-4">
        {users.map((user) => (
          <li key={user.id} className="rounded-lg border p-4">
            <p className="font-medium">{user.name} <span className="font-normal text-ink-muted">{user.email}</span></p>
            <p className="mt-1 text-body">{user.role || 'user'} · {user.banned ? 'Banned' : 'Active'}</p>
            {user.banned && user.banReason && <p className="mt-2 text-body">{user.banReason}</p>}
            {user.id !== staff.id && (user.banned
              ? <Button className="mt-4" variant="secondary" disabled={busy} onClick={() => void changeBan(user.id, false)} aria-label={`Unban ${user.email}`}>Unban</Button>
              : <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(event) => {
                  event.preventDefault()
                  void changeBan(user.id, true, String(new FormData(event.currentTarget).get('reason')))
                }}>
                  <div className="flex flex-col gap-2"><Label htmlFor={`reason-${user.id}`}>Ban reason (optional)</Label><Input id={`reason-${user.id}`} name="reason" maxLength={500} /></div>
                  <Button type="submit" variant="secondary" disabled={busy} aria-label={`Ban ${user.email}`}>Ban</Button>
                </form>)}
          </li>
        ))}
      </ul>
      <nav aria-label="User pages" className="mt-6 flex items-center gap-4">
        <Button variant="secondary" disabled={busy || search.offset === 0} onClick={() => void navigate({ search: { ...search, offset: Math.max(0, search.offset - 25) } })}>Previous page</Button>
        <Button variant="secondary" disabled={busy || search.offset + 25 >= total} onClick={() => void navigate({ search: { ...search, offset: search.offset + 25 } })}>Next page</Button>
      </nav>
    </main>
  )
}
