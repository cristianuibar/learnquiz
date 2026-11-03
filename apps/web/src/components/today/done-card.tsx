import { Check } from 'lucide-react'
import type { TodayHero } from '@learnquiz/api/today'
import { StartButton } from '@/components/start-button'

export function DoneCard({
  hero,
  topicId,
  placement,
  offline,
  noticeId,
}: {
  hero: Extract<TodayHero, { kind: 'done' }>
  topicId: string | null
  placement: boolean
  offline: boolean
  noticeId?: string
}) {
  return (
    <section className="flex flex-col gap-6 rounded-md border border-border bg-surface-card px-4 pt-6 pb-4 text-ink">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Check className="size-6 shrink-0 text-brand" aria-hidden="true" />
          <h2 className="text-title-2">{hero.title}</h2>
        </div>
        <p className="text-body text-ink-muted">{hero.meta}</p>
      </div>
      {topicId && (
        <StartButton
          topicId={topicId}
          placement={placement}
          variant="secondary"
          label={hero.action.accessibleLabel}
          disabled={hero.action.disabled || offline}
          describedBy={offline ? noticeId : undefined}
          className="w-full sm:w-full"
        >
          {hero.action.label}
        </StartButton>
      )}
    </section>
  )
}
