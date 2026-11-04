import { useId, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { SummaryView } from '@learnquiz/api'
import { LearnQuizMark } from './learn-quiz-mark'
import { StreakPill } from './today/streak-pill'
import { cn } from '@/lib/utils'

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

function clock(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00'
  const total = Math.floor(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function percent(value: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value * 100))) : 0
}

function barValueText(before: number, after: number, benchmark: number | null): string {
  const b = percent(before)
  const a = percent(after)
  const base = a > b ? `${a}%, up from ${b}%` : a < b ? `${a}%, down from ${b}%` : `${a}%, no change`
  return benchmark !== null ? `${base}. Benchmark ${percent(benchmark)}%` : base
}

export function scoreLine(s: { correct: number; total: number; durationMs: number; ungraded: number }): string {
  const base = `${s.correct} of ${s.total} correct · ${clock(s.durationMs)}`
  return s.ungraded > 0 ? `${base} · ${s.ungraded} not graded` : base
}

export function RewardChips({ xp, streak }: { xp: number; streak: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="inline-flex min-h-8 items-center rounded-full bg-accent px-3 py-1 text-label font-bold tabular-nums text-on-accent">+{xp} XP</span>
      {streak > 0 && <StreakPill popIn streak={{ text: streak === 1 ? '1 day' : `${streak} days`, label: '' }} />}
    </div>
  )
}

export function CoachLine({ children }: { children: string }) {
  return (
    <aside aria-label="Coach note" className="flex items-start gap-3 rounded-md bg-surface-sunken px-4 py-3">
      <LearnQuizMark className="mt-px size-5 shrink-0" />
      <p className="text-body text-ink">{children}</p>
    </aside>
  )
}

export function MasteryDeltaBar({ label, before, after, benchmark }: { label: string; before: number; after: number; benchmark: number | null }) {
  const b = percent(before)
  const a = percent(after)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={a}
      aria-valuetext={barValueText(before, after, benchmark)}
      className="relative flex h-2 rounded-full bg-surface-sunken"
    >
      <div className="h-full rounded-l-full bg-ink-muted" style={{ width: `${Math.min(a, b)}%` }} />
      <div className="h-full bg-brand" style={{ width: `${Math.max(0, a - b)}%` }} />
      {benchmark !== null && <div aria-hidden className="absolute -top-1 -bottom-1 w-0.5 bg-ink" style={{ left: `${percent(benchmark)}%` }} />}
    </div>
  )
}

export function MasteryMoved({ rows, benchmark }: { rows: SummaryView['masteryMoved']; benchmark: number | null }) {
  if (rows.length === 0) return null
  return (
    <section>
      <h2 className="text-title-3 text-ink">Mastery moved</h2>
      <ul>
        {rows.map((row, i) => (
          <li key={row.unitId} className={cn('flex flex-col gap-2 py-3', i > 0 && 'border-t border-border')}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-body">{row.unitName}</span>
              <span className="text-label tabular-nums">
                <span className="text-ink-muted">{percent(row.before)}%</span> → {percent(row.after)}%
              </span>
            </div>
            <MasteryDeltaBar label={`${row.unitName} mastery`} before={row.before} after={row.after} benchmark={benchmark} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function MistakesDisclosure({ mistakes }: { mistakes: SummaryView['mistakes'] }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  if (mistakes.length === 0) return null
  return (
    <section aria-label="Mistakes" className="border-y border-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn('flex min-h-12 w-full items-center justify-between gap-3 rounded-md text-left', focusRing)}
      >
        <span className="text-title-3">Mistakes ({mistakes.length})</span>
        <ChevronDown aria-hidden className={cn('size-5 text-ink-muted transition-transform duration-fast motion-reduce:transition-none', open && 'rotate-180')} />
      </button>
      <ul id={id} hidden={!open}>
        {mistakes.map((m) => (
          <li key={m.itemId} className="border-t border-border">
            <Link
              to="/play/quick/$itemId"
              params={{ itemId: m.itemId }}
              aria-label={`Review: ${m.conceptName}${m.wasSure ? '. You were sure' : ''}`}
              className={cn('flex min-h-14 items-center justify-between gap-3 rounded-md py-3', focusRing)}
            >
              <span className="flex flex-col">
                <span className="text-body">{m.conceptName}</span>
                {m.wasSure && <span className="text-caption text-ink-muted">You were sure</span>}
              </span>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
