import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

const row = 'flex min-h-12 items-center justify-between gap-4 py-2 text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

export function AccountRows({ email, companies, isAdmin, signingOut, error, onSignOut }: {
  email: string | null; companies: { slug: string; name: string }[]; isAdmin: boolean; signingOut?: boolean; error?: string | null; onSignOut: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface-card px-4">
        {email && <li className={row}><span>Email</span><span className="min-w-0 truncate text-ink-muted">{email}</span></li>}
        <li><Link to="/welcome" search={{ review: 1 as unknown as '1' }} className={row}>What we record<ChevronRight aria-hidden className="size-5 text-ink-muted" /></Link></li>
        {companies.map((company) => (
          <li key={company.slug}>
            <Link to="/org/$slug" params={{ slug: company.slug }} className={row}>{company.name} portal<ChevronRight aria-hidden className="size-5 text-ink-muted" /></Link>
          </li>
        ))}
        {isAdmin && <li><Link to="/admin" className={row}>Staff area<ChevronRight aria-hidden className="size-5 text-ink-muted" /></Link></li>}
      </ul>
      <Button variant="secondary" className="w-full" disabled={signingOut} onClick={onSignOut}>Sign out</Button>
      {error && <p role="alert" className="rounded-lg bg-surface-sunken px-4 py-3 text-body text-ink">{error}</p>}
    </div>
  )
}
