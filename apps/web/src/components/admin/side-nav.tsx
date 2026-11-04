import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, useRouterState, type LinkComponentProps } from '@tanstack/react-router'

export type SideNavItem = {
  to: LinkComponentProps
  label: string
  icon: ReactNode
  count?: ReactNode
}

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

// `band` offsets everything sticky/fixed by the 48px read-only band above.
// Sticky side navigation from lg up; below lg a top bar with a Menu button opens the same nav as a sheet.
export function SideNav({ label, header, items, foot, band = false, children }: { label: string; header: ReactNode; items: SideNavItem[]; foot?: ReactNode; band?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const menuRef = useRef<HTMLButtonElement>(null)
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  // Moving to another page closes the sheet; focus is left to the root, which focuses the page heading.
  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      menuRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className={`grid ${band ? 'min-h-[calc(100vh-48px)]' : 'min-h-screen'} content-start lg:grid-cols-[248px_minmax(0,1fr)]`}>
      <header className={`sticky ${band ? 'top-12' : 'top-0'} z-30 flex h-14 items-center justify-between gap-2 border-b border-border bg-surface-card pl-4 pr-2 lg:hidden`}>
        <div className="flex min-w-0 items-center gap-3">{header}</div>
        <button
          ref={menuRef}
          type="button"
          aria-label="Menu"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((o) => !o)}
          className={`flex size-11 shrink-0 items-center justify-center rounded-md text-ink hover:bg-surface-sunken ${focusRing}`}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>
      {open && <div aria-hidden="true" className={`fixed inset-0 ${band ? 'top-[104px]' : 'top-14'} z-20 bg-scrim lg:hidden`} onClick={() => setOpen(false)} />}
      <nav
        aria-label={label}
        className={`${open ? `fixed inset-x-0 bottom-0 ${band ? 'top-[104px]' : 'top-14'} z-30 flex overflow-y-auto` : 'hidden'} flex-col gap-6 border-border bg-surface-card px-3 py-4 lg:sticky ${band ? 'lg:top-12 lg:h-[calc(100vh-48px)]' : 'lg:top-0 lg:h-screen'} lg:z-auto lg:flex lg:overflow-y-auto lg:border-r`}
      >
        <div className="hidden min-h-11 items-center gap-3 px-2 py-1 lg:flex">{header}</div>
        <ul id={listId} className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.label}>
              <Link
                {...item.to}
                onClick={() => setOpen(false)}
                className={`group flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-ink hover:bg-surface-page aria-[current=page]:bg-brand-tint aria-[current=page]:font-semibold ${focusRing}`}
              >
                <span className="text-ink-muted group-aria-[current=page]:text-brand">{item.icon}</span>
                <span className="min-w-0 flex-1">{item.label}</span>
                {item.count}
              </Link>
            </li>
          ))}
        </ul>
        {foot && <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">{foot}</div>}
      </nav>
      <div className="flex min-w-0 flex-col">{children}</div>
    </div>
  )
}
