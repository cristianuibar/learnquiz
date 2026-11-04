import { Flag } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { usePortalLinks } from '@/components/portal/portal-context'
import type { Question } from './question-row'

type FlagT = Question['flags'][number]

export function flagTime(ms: number) {
  const d = new Date(ms)
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function FlagGroup({ flag, id }: { flag: FlagT; id: string }) {
  const links = usePortalLinks()
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-2 rounded-md bg-surface-sunken px-4 py-3">
      <p id={id} className="flex items-center gap-2 text-label text-ink">
        <Flag aria-hidden className="size-4 shrink-0" />
        <span>Reported by <Link {...links.person(flag.reporterId)} className="underline">{flag.reporterName}</Link> · {flagTime(flag.createdAt)}</span>
      </p>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-body text-ink">
        <dt className="text-ink-muted">Reason</dt><dd>{flag.label}</dd>
        {flag.note ? <><dt className="text-ink-muted">Note</dt><dd>{`“${flag.note}”`}</dd></> : null}
        {flag.attempt ? <><dt className="text-ink-muted">Attempt</dt><dd>{`Chose “${flag.attempt.answer}” · ${cap(flag.attempt.confidence)}`}</dd></> : null}
      </dl>
    </div>
  )
}
