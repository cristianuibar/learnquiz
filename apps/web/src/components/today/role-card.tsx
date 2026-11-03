import { Link } from '@tanstack/react-router'
import type { TodayRoleView } from '@learnquiz/api/today'
import { MasteryBar } from '@/components/mastery-bar'

export function RoleCard({ role }: { role: TodayRoleView }) {
  return (
    <Link
      to="/me/profile"
      aria-label={role.accessibleLabel}
      className="flex flex-col gap-3 rounded-md border border-border bg-surface-card p-4 text-ink active:bg-surface-sunken"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-label">{role.name}</span>
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-ink-muted"
          aria-hidden
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </div>
      <MasteryBar
        value={(role.pct ?? 0) / 100}
        benchmark={role.benchmarkPct / 100}
        label="Role mastery"
        valueText={role.started ? role.progressLabel : `Not started, benchmark ${role.benchmarkPct}%`}
      />
      <div className="flex min-h-7 items-center justify-between gap-2">
        {role.started ? (
          <span className="text-label tabular-nums">
            {role.pct}%<span className="font-medium text-ink-muted"> of {role.benchmarkPct}% benchmark</span>
          </span>
        ) : (
          <span className="inline-flex min-h-7 items-center gap-1 rounded-full border border-current bg-surface-sunken py-0.5 pr-3 pl-2 text-chip text-ink-muted">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeDasharray="2 5.07" />
            </svg>
            {role.chip}
          </span>
        )}
        <span className="text-caption text-ink-muted tabular-nums">{role.dayLabel}</span>
      </div>
    </Link>
  )
}
