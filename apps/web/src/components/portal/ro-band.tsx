import { Link, type LinkComponentProps } from '@tanstack/react-router'

// Fixed-height (48px) strip above the staff read-only portal. SideNav's `band` prop offsets its sticky parts by this height.
export function RoBand({ company, exitTo }: { company: string; exitTo: LinkComponentProps }) {
  return (
    <div role="region" aria-label="Read-only view" className="sticky top-0 z-40 flex h-12 items-center gap-3 bg-surface-inverse pl-4 pr-2 text-sm font-semibold text-on-inverse">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <span className="min-w-0 flex-1 truncate">Read only · You are viewing {company} as Learn Quiz staff. Nothing here can be changed.</span>
      <Link {...exitTo} className="inline-flex min-h-11 shrink-0 items-center rounded-sm px-2 text-on-inverse underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-inverse">
        Exit to staff admin
      </Link>
    </div>
  )
}
