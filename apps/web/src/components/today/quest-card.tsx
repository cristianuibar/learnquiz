import { useId } from 'react'
import type { TodayQuest } from '@learnquiz/api/today'

export function QuestCard({ quests }: { quests: TodayQuest[] }) {
  const id = useId()
  if (quests.length === 0) return null
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="text-title-3">Daily quest</h2>
      <ul className="divide-y divide-border rounded-md border border-border bg-surface-card px-4">
        {quests.map((q) => (
          <li key={q.key} className="flex min-h-14 items-center gap-3 py-3">
            {q.done ? (
              <span role="img" aria-label="Done" className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4.5 12.5l5 5L19.5 7" />
                </svg>
              </span>
            ) : (
              <svg role="img" aria-label="Not done" viewBox="0 0 24 24" className="size-5 shrink-0 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <circle cx="12" cy="12" r="9" strokeDasharray="2 5.07" />
              </svg>
            )}
            <span className="min-w-0 flex-1 text-body">{q.label}</span>
            {q.count && <span className="text-caption tabular-nums text-ink-muted">{q.count}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
