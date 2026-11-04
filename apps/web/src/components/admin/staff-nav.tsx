import type { ReactNode } from 'react'
import { SideNav, type SideNavItem } from '@/components/admin/side-nav'
import { LearnQuizMark } from '@/components/learn-quiz-mark'
import { useSignOut } from '@/components/inline-error'

const Icon = ({ size = 20, children }: { size?: number; children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

const icons = {
  companies: <Icon><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3" /></Icon>,
  users: <Icon><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Icon>,
  usage: <Icon><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Icon>,
  jobs: <Icon><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></Icon>,
  flags: <Icon><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></Icon>,
}

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'

function Header() {
  return (
    <>
      <LearnQuizMark className="size-8 shrink-0" />
      <span className="text-label text-ink lg:hidden">Learn Quiz staff</span>
      <div className="hidden min-w-0 flex-col lg:flex">
        <span className="text-label text-ink">Learn Quiz</span>
        <span className="text-caption text-ink-muted">Staff admin</span>
      </div>
    </>
  )
}

function Foot({ name }: { name: string }) {
  const { busy, error, signOut } = useSignOut({ keepPlace: false })
  return (
    <>
      <div className="flex items-center gap-2 px-2">
        <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-xs font-semibold text-ink">
          {initials(name)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-label text-ink">{name}</span>
          <span className="text-caption text-ink-muted">Staff</span>
        </div>
        <button
          type="button"
          aria-label="Sign out"
          disabled={busy}
          onClick={() => void signOut()}
          className="flex size-11 shrink-0 items-center justify-center rounded-md text-ink hover:bg-surface-sunken disabled:cursor-not-allowed disabled:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Icon><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H4" /></Icon>
        </button>
      </div>
      {error && <p role="alert" className="px-2 text-caption font-medium text-ink">{error}</p>}
    </>
  )
}

// Staff admin side navigation; `failed` is the count of failed generation jobs.
export function StaffNav({ failed, name, children }: { failed: number; name: string; children: ReactNode }) {
  const items: SideNavItem[] = [
    { to: { to: '/admin/companies' }, label: 'Companies', icon: icons.companies },
    { to: { to: '/admin/users', search: { search: '', role: 'all', status: 'all', offset: 0 }, activeOptions: { includeSearch: false } }, label: 'Users', icon: icons.users },
    { to: { to: '/admin/usage', activeOptions: { includeSearch: false } }, label: 'Model usage', icon: icons.usage },
    {
      to: { to: '/admin/jobs' },
      label: 'Generation jobs',
      icon: icons.jobs,
      count: failed > 0 && (
        <span className="text-caption font-semibold tabular-nums text-ink-muted">
          {failed}
          <span className="sr-only"> failed</span>
        </span>
      ),
    },
    { to: { to: '/admin/flags' }, label: 'Content flags', icon: icons.flags },
  ]
  return (
    <SideNav label="Staff admin" header={<Header />} items={items} foot={<Foot name={name} />}>
      {children}
    </SideNav>
  )
}
