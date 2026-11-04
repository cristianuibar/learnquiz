import { useId } from 'react'
import { Check, RotateCw } from 'lucide-react'
import { criticalRows, formatShortDate, type Profile } from '@learnquiz/api/progress'
import { Link } from '@tanstack/react-router'
import { StatusChip } from '@/components/admin/status-chip'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

// `unitNames` (concept id to unit name) switches to the company admin's card: titled heading, concept first, unit in the caption, status chip at the end.
export function CriticalSteps({ confidentErrors, flag = false, unitNames }: { confidentErrors: Profile['confidentErrors']; flag?: boolean; unitNames?: Record<string, string> }) {
  const id = useId()
  const rows = criticalRows(confidentErrors)
  if (rows.length === 0) return null
  if (unitNames) {
    return (
      <section aria-labelledby={id} className="flex flex-col rounded-md border border-border bg-surface-card">
        <h2 id={id} className="text-title-2 p-4">
          Confident errors on critical steps
        </h2>
        <ul className="divide-y divide-border border-t border-border px-4">
          {rows.map((row) => {
            const unit = unitNames[row.conceptId]
            return (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-body font-semibold">{row.concept}</p>
                  <p className="text-caption text-ink-muted tabular-nums">{`${unit ? `${unit} · ` : ''}Answered with confidence, missed ${formatShortDate(row.at)}`}</p>
                </div>
                {row.correctedAt === null ? (
                  <StatusChip tone="dashed" icon={RotateCw}>Awaiting correction</StatusChip>
                ) : (
                  <StatusChip tone="settled" icon={Check}>{`Corrected ${formatShortDate(row.correctedAt)}`}</StatusChip>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    )
  }
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-title-3">
        Critical steps to recheck
      </h2>
      <ul className="divide-y divide-border rounded-md border border-border bg-surface-card px-4">
        {rows.map((row) => {
          const Icon = row.correctedAt === null ? RotateCw : Check
          return (
            <li key={row.id} className="flex flex-col items-start gap-2 py-3">
              <Badge className="min-h-7 pl-2 tabular-nums">
                <Icon aria-hidden />
                {row.chipText}
              </Badge>
              <div className="flex flex-col gap-1">
                <p className="text-body">{row.concept}</p>
                <p className="text-caption text-ink-muted tabular-nums">{`Answered with confidence, missed ${formatShortDate(row.at)}`}</p>
              </div>
              {flag && (
                <Button asChild variant="secondary">
                  <Link to="/me/flag" search={{ conceptId: row.conceptId }}>Flag an unfair result</Link>
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
