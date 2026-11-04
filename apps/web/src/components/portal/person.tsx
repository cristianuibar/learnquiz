import { Check, ChevronRight, Eye, Flag } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { formatShortDate, type Profile } from '@learnquiz/api/progress'
import { Page, PageHeader } from '@/components/admin/page'
import { StatusChip } from '@/components/admin/status-chip'
import { usePortalLinks } from '@/components/portal/portal-context'
import { CriticalSteps } from '@/components/profile/critical-steps'
import { EmptyMasteryCard, MasteryCard } from '@/components/profile/mastery-card'
import { UnitAccordion } from '@/components/profile/unit-accordion'
import { WeeklyTrend } from '@/components/profile/weekly-trend'
import { Button } from '@/components/ui/button'
import type { MemberFlag } from '@/server/profile'

const ring = 'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

function FlagsCard({ flags, firstName }: { flags: MemberFlag[]; firstName: string }) {
  const links = usePortalLinks()
  return (
    <section aria-labelledby="person-flags" className="flex flex-col rounded-md border border-border bg-surface-card">
      <h2 id="person-flags" className="text-title-2 p-4">
        Flags from {firstName} · progress unchanged
      </h2>
      <ul className="divide-y divide-border border-t border-border px-4">
        {flags.map((flag) => (
          <li key={flag.id} className="flex flex-col items-start gap-2 py-3">
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-body font-semibold tabular-nums">
                <Flag aria-hidden className="size-4 shrink-0 text-ink-muted" />
                Flagged a question · {formatShortDate(flag.createdAt)}
              </p>
              {flag.resolvedAt === null ? (
                <StatusChip tone="dashed" icon={Flag}>Open</StatusChip>
              ) : (
                <StatusChip tone="settled" icon={Check}>Resolved</StatusChip>
              )}
            </div>
            <p className="text-caption text-ink-muted">{flag.unit} · {flag.stem}</p>
            <p className="text-body">{flag.label}</p>
            {flag.note && <p className="text-caption text-ink-muted">{flag.note}</p>}
            <Button asChild variant="link" className="-ml-1">
              <Link {...links.questions({ role: flag.roleId, item: flag.itemId })}>Open in Questions</Link>
            </Button>
          </li>
        ))}
      </ul>
      <p className="border-t border-border p-4 text-caption text-ink-muted">Flags never change progress.</p>
    </section>
  )
}

// A company admin's read-only view of one member's Training progress.
export function Person({ profile, flags }: { profile: Profile; flags: MemberFlag[] }) {
  const links = usePortalLinks()
  const firstName = profile.name.split(/\s+/)[0] ?? profile.name
  const { achievedAt } = profile.proficiency
  // A proficient trend ends on the date reached; reached before the shown weeks, they all stay.
  const upTo = achievedAt === null ? [] : profile.weeks.filter((w) => w.start <= achievedAt)
  const shown = upTo.length === 0 ? profile : { ...profile, weeks: upTo }
  const unitNames: Record<string, string> = {}
  for (const unit of profile.units) for (const concept of unit.concepts) unitNames[concept.id] = unit.name
  const hasErrors = profile.confidentErrors.length > 0
  return (
    <Page capped>
      <PageHeader
        crumbs={
          <ol className="m-0 flex list-none flex-wrap items-center gap-1 p-0">
            <li>
              <Link {...links.people} className={`inline-flex min-h-11 items-center font-medium underline ${ring}`}>
                People
              </Link>
            </li>
            <li aria-hidden className="flex items-center">
              <ChevronRight aria-hidden className="size-4" />
            </li>
            <li>
              <span aria-current="page" className="text-ink">{profile.name}</span>
            </li>
          </ol>
        }
        title="Training progress"
        meta={
          <div className="flex flex-col gap-1">
            <p className="text-body text-ink">{profile.name}{profile.role ? ` · ${profile.role}` : ''}</p>
            <p className="flex items-center gap-2 text-caption">
              <Eye aria-hidden className="size-4 shrink-0" />
              {firstName} sees this same page in the app.
            </p>
          </div>
        }
      />
      {profile.started ? (
        <>
          <div className="grid items-start gap-6 lg:grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
            <MasteryCard profile={profile} portal />
            <WeeklyTrend profile={shown} card />
          </div>
          <UnitAccordion units={profile.units} benchmark={profile.benchmark} portal />
          {(hasErrors || flags.length > 0) && (
            <div className="grid items-start gap-6 sm:grid-cols-2">
              {hasErrors && <CriticalSteps confidentErrors={profile.confidentErrors} unitNames={unitNames} />}
              {flags.length > 0 && <FlagsCard flags={flags} firstName={firstName} />}
            </div>
          )}
        </>
      ) : (
        <div className="max-w-[548px]">
          <EmptyMasteryCard profile={profile} portal={{ firstName }} />
        </div>
      )}
    </Page>
  )
}
