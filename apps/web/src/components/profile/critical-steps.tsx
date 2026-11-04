import { useId } from 'react'
import { Check, RotateCw } from 'lucide-react'
import { criticalRows, formatShortDate, type Profile } from '@learnquiz/api/progress'
import { Link } from '@tanstack/react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export function CriticalSteps({ confidentErrors, flag = false }: { confidentErrors: Profile['confidentErrors']; flag?: boolean }) {
  const id = useId()
  const rows = criticalRows(confidentErrors)
  if (rows.length === 0) return null
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
