import { useEffect, useRef, useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { Ban, LogOut, RotateCcw } from 'lucide-react'
import { z } from 'zod'
import { Banner } from '@/components/admin/banner'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
import { DataTable, NoResults, NullCell, type Column } from '@/components/admin/data-table'
import { Page, PageHeader } from '@/components/admin/page'
import { Pager } from '@/components/admin/pager'
import { SearchField } from '@/components/admin/search-field'
import { Status } from '@/components/admin/status-chip'
import { errorMessage, RouteError } from '@/components/inline-error'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { listUsers, setUserBan } from '@/server/admin-users'

const PAGE_SIZE = 25
const searchSchema = z.object({
  search: z.string().max(200).catch(''),
  role: z.enum(['all', 'admin', 'user']).catch('all'),
  status: z.enum(['all', 'active', 'banned']).catch('all'),
  offset: z.number().int().min(0).catch(0),
})

type Search = z.infer<typeof searchSchema>
const DEFAULTS: Search = { search: '', role: 'all', status: 'all', offset: 0 }

export const Route = createFileRoute('/admin/users')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listUsers({ data: deps }),
  errorComponent: RouteError,
  component: Users,
})

type UserRow = Awaited<ReturnType<typeof listUsers>>['users'][number]

const joined = (at: number) => new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function Users() {
  const { users, total } = Route.useLoaderData()
  const { staff } = Route.useRouteContext()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const searchRef = useRef<HTMLInputElement>(null)
  const bannedRef = useRef<string | null>(null)
  const refocusRef = useRef<string | null>(null)
  const undoRef = useRef<HTMLButtonElement>(null)
  const [target, setTarget] = useState<UserRow | null>(null)
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<{ user: UserRow; banned: boolean } | null>(null)
  const [failure, setFailure] = useState('')
  const [query, setQuery] = useState(search.search)

  useEffect(() => setQuery(search.search), [search.search])

  useEffect(() => {
    if (!refocusRef.current) return
    // A status filter can drop the unbanned row; fall back to the search field.
    ;(document.querySelector<HTMLElement>(`[data-ban-user="${refocusRef.current}"]`) ?? searchRef.current)?.focus()
    refocusRef.current = null
  }, [users])

  const go = (next: Partial<Search>) => void navigate({ search: { ...search, ...next, offset: next.offset ?? 0 } })
  const filtered = !!search.search || search.role !== 'all' || search.status !== 'all'

  async function unban(user: UserRow) {
    setFailure('')
    try {
      await setUserBan({ data: { userId: user.id, banned: false } })
      refocusRef.current = user.id
      await router.invalidate()
      setMessage({ user, banned: false })
    } catch (err) {
      setFailure(errorMessage(err))
    }
  }

  const columns: Column<UserRow>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (u) => (
        <>
          <span className="flex items-center gap-2">
            <span className="font-medium text-ink">{u.name}</span>
            {u.id === staff.id && <Badge>You</Badge>}
          </span>
          <span className="block text-caption text-ink-muted">{u.email}</span>
        </>
      ),
    },
    { key: 'role', header: 'Global role', label: 'Global role', cell: (u) => (u.admin ? <Badge>Admin</Badge> : 'User') },
    {
      key: 'company',
      header: 'Company',
      cell: (u) => u.company
        ? <><span className="block">{u.company.name}</span><span className="block text-caption text-ink-muted">{capital(u.company.role)}</span></>
        : <NullCell label="No company" />,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (u) => (
        <>
          <Status word={u.banned ? 'Banned' : 'Active'} />
          {u.banned && u.banReason && <span className="mt-1 block text-caption text-ink-muted">{u.banReason}</span>}
        </>
      ),
    },
    { key: 'joined', header: 'Joined', cell: (u) => joined(u.createdAt) },
    {
      key: 'action',
      header: <span className="sr-only">Action</span>,
      label: 'Action',
      align: 'end',
      cell: (u) => {
        if (u.banned) {
          return (
            <Button variant="secondary" data-unban-user={u.id} onClick={() => void unban(u)}>
              Unban<span className="sr-only"> {u.name}</span>
            </Button>
          )
        }
        const own = u.id === staff.id
        return (
          <>
            <Button
              variant="ghost"
              data-ban-user={u.id}
              aria-disabled={own || undefined}
              className={own ? 'cursor-not-allowed text-ink-muted hover:bg-transparent' : undefined}
              aria-describedby={own ? `own-${u.id}` : undefined}
              onClick={() => {
                if (own) return
                setFailure('')
                setTarget(u)
                setOpen(true)
              }}
            >
              Ban<span className="sr-only"> {u.name}</span>
            </Button>
            {own && <span id={`own-${u.id}`} className="sr-only">You can't ban yourself</span>}
          </>
        )
      },
    },
  ]

  const who = target && [target.email, target.company?.name, target.company && capital(target.company.role)].filter(Boolean).join(' · ')

  return (
    <Page className="p-0 md:p-0">
      <PageHeader title="Users" />
      <div role="status" className="empty:-mb-6 md:empty:-mb-8">
        {message && (
          <Banner
            icon={Ban}
            action={message.banned && (
              <Button ref={undoRef} variant="link" onClick={() => void unban(message.user)}>Undo</Button>
            )}
          >
            {message.user.name} is {message.banned ? 'banned' : 'unbanned'}.
          </Banner>
        )}
      </div>
      {failure && <Banner kind="alert">{failure}</Banner>}
      <DataTable
        caption="Users, newest first"
        columns={columns}
        rows={users}
        rowKey={(u) => u.id}
        sort={{ key: 'joined', direction: 'descending' }}
        toolbar={
          <div className="flex flex-wrap items-end gap-3 border-b border-border p-4">
            <form
              role="search"
              className="min-w-0 flex-1 basis-64"
              onSubmit={(event) => {
                event.preventDefault()
                go({ search: query.trim() })
              }}
            >
              <SearchField ref={searchRef} name="search" label="Search by email or name" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={200} className="max-w-none" />
            </form>
            <label className="flex flex-col gap-1">
              <span className="text-label">Global role</span>
              <Select value={search.role} onChange={(e) => go({ role: e.target.value as typeof search.role })}>
                <option value="all">All</option>
                <option value="admin">Admin</option>
                <option value="user">User</option>
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-label">Status</span>
              <Select value={search.status} onChange={(e) => go({ status: e.target.value as typeof search.status })}>
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="banned">Banned</option>
              </Select>
            </label>
          </div>
        }
        empty={
          search.offset > 0 ? (
            <tr role="row">
              <td role="cell" colSpan={columns.length} className="px-4 py-12 text-center">
                <p className="text-ink">No users on this page.</p>
                <Link to="/admin/users" search={{ ...search, offset: 0 }} className="inline-flex min-h-11 items-center rounded-md underline focus-visible:ring-[3px] focus-visible:ring-ring/50">Go to page 1</Link>
              </td>
            </tr>
          ) : filtered ? (
            <NoResults colSpan={columns.length} searchRef={searchRef} onClear={() => void navigate({ search: DEFAULTS })}>No users match these filters.</NoResults>
          ) : (
            <tr role="row"><td role="cell" colSpan={columns.length} className="px-4 py-12 text-center text-ink">No users have signed up yet.</td></tr>
          )
        }
        footer={total > 0 && users.length > 0 && (
          <Pager
            from={search.offset + 1}
            to={search.offset + users.length}
            total={total}
            noun="users"
            page={search.offset / PAGE_SIZE + 1}
            onPrevious={() => go({ offset: Math.max(0, search.offset - PAGE_SIZE) })}
            onNext={() => go({ offset: search.offset + PAGE_SIZE })}
          />
        )}
      />
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Ban ${target?.name ?? ''}?`}
        description={who}
        reason
        verb="Ban"
        object="user"
        consequences={[
          { icon: LogOut, text: "They're signed out on every device and can't sign in." },
          { icon: RotateCcw, text: 'Their training records stay. Unban restores access.' },
        ]}
        returnFocus={() => {
          const id = bannedRef.current
          bannedRef.current = null
          // A status filter can drop the banned row; fall back to the banner's Undo.
          return id ? document.querySelector<HTMLElement>(`[data-unban-user="${id}"]`) ?? undoRef.current : null
        }}
        onConfirm={async (reason) => {
          if (!target) return
          await setUserBan({ data: { userId: target.id, banned: true, reason } })
          bannedRef.current = target.id
          await router.invalidate()
          setMessage({ user: target, banned: true })
        }}
      />
    </Page>
  )
}
