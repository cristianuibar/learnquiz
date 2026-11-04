import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Admin page frame: fills the content column, or caps at 1120 of content for forms and detail pages.
export function Page({ capped, className, children }: { capped?: boolean; className?: string; children: ReactNode }) {
  return <main className={cn('flex w-full flex-col gap-6 px-4 py-6 md:gap-8 md:p-8', capped && 'max-w-[1184px]', className)}>{children}</main>
}

// The h1 takes focus after a route change; actions stretch full width below 640.
export function PageHeader({ crumbs, title, meta, actions }: { crumbs?: ReactNode; title: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col items-stretch gap-4 md:flex-row md:flex-wrap md:items-end md:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        {crumbs && <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-label text-ink-muted">{crumbs}</nav>}
        <h1 tabIndex={-1} className="text-title-1 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{title}</h1>
        {meta && <div className="text-body text-ink-muted">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3 max-md:[&>*]:flex-1">{actions}</div>}
    </div>
  )
}
