import type { ReactNode } from 'react'
import { SideNav } from '@/components/admin/side-nav'
import { LearnQuizMark } from '@/components/learn-quiz-mark'
import { useSignOut } from '@/components/inline-error'
import { usePortalLinks } from '@/components/portal/portal-context'
import type { getPortalShell } from '@/server/org-shell'

type Shell = Awaited<ReturnType<typeof getPortalShell>>

const Icon = ({ size = 20, children }: { size?: number; children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

const icons = {
  overview: <Icon><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></Icon>,
  roles: <Icon><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" /></Icon>,
  questions: <Icon><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01" /></Icon>,
  people: <Icon><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></Icon>,
  settings: <Icon><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></Icon>,
}

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'

function Header({ shell }: { shell: Shell }) {
  return (
    <>
      {shell.logoUrl ? (
        <img src={shell.logoUrl} alt="" className="size-8 shrink-0 rounded-md object-cover" />
      ) : (
        <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand text-sm font-semibold text-on-brand">
          {shell.name.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 truncate text-label text-ink">{shell.name}</span>
    </>
  )
}

function Foot({ shell, readonly }: { shell: Shell; readonly: boolean }) {
  const { busy, error, signOut } = useSignOut({ keepPlace: false })
  return (
    <>
      {readonly ? (
        <div className="flex items-center gap-2 px-2">
          <span className="inline-flex h-7 items-center gap-1 rounded-full border border-border-strong px-2.5 text-caption font-semibold text-ink">
            <Icon size={16}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Icon>
            Read only
          </span>
          <span className="text-caption text-ink-muted">Staff view</span>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 px-2">
            <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-xs font-semibold text-ink">
              {initials(shell.userName)}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-label text-ink">{shell.userName}</span>
              {shell.role && <span className="text-caption text-ink-muted">{shell.role === 'owner' ? 'Owner' : 'Admin'}</span>}
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
      )}
      <div className="flex items-center gap-2 px-2 py-1 text-caption font-medium text-ink-muted">
        <LearnQuizMark className="size-5" />
        <span>Learn Quiz</span>
      </div>
    </>
  )
}

// `current` false (a not-found page under the portal) leaves every item unmarked.
export function PortalNav({ shell, current = true, readonly = false, children }: { shell: Shell; current?: boolean; readonly?: boolean; children: ReactNode }) {
  const links = usePortalLinks()
  const all = [
    { to: links.overview, label: 'Overview', icon: icons.overview },
    { to: links.roles, label: 'Roles', icon: icons.roles },
    { to: links.questions(), label: 'Questions', icon: icons.questions },
    { to: links.people, label: 'People', icon: icons.people },
    { to: links.settings, label: 'Settings', icon: icons.settings },
  ]
  // The staff portal only has Overview and Roles routes today; a follow-on issue adds Questions, People and Settings.
  const items = readonly ? all.slice(0, 2) : all
  const marked = current ? items : items.map((i) => ({ ...i, to: { ...i.to, activeOptions: { ...('activeOptions' in i.to ? i.to.activeOptions : {}), exact: true } } }))
  return (
    <SideNav label={`${shell.name} portal`} header={<Header shell={shell} />} items={marked} foot={<Foot shell={shell} readonly={readonly} />} band={readonly}>
      {children}
    </SideNav>
  )
}
