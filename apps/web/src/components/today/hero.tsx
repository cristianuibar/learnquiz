import { useState } from 'react'
import type { TodayHero } from '@learnquiz/api/today'
import { StartButton } from '@/components/start-button'
import { cn } from '@/lib/utils'

type HeroProps = Extract<TodayHero, { kind: 'first' | 'basics' | 'normal' | 'building' }>

function BuildingProgress({ ready, total, status }: { ready: number | null; total: number; status: string | null }) {
  const done = ready ?? 0
  const pct = Math.min(100, Math.max(0, (done / total) * 100))
  const bucket = Math.floor(pct / 10)
  const [shown, setShown] = useState({ bucket, status })
  if (shown.bucket !== bucket) setShown({ bucket, status })

  return (
    <div className="flex flex-col gap-3">
      <div
        role="progressbar"
        aria-label="Questions ready"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${done} of ${total} topics ready`}
        className="h-2 overflow-hidden rounded-full border border-current"
      >
        <div className="h-full bg-current" style={{ width: `${pct}%` }} />
      </div>
      {shown.status && (
        <p role="status" className="text-body">
          {shown.status}
        </p>
      )}
    </div>
  )
}

export function Hero({
  hero,
  topicId,
  placement,
  offline,
  noticeId,
}: {
  hero: HeroProps
  topicId: string | null
  placement: boolean
  offline: boolean
  noticeId?: string
}) {
  return (
    <section
      className={cn(
        'flex flex-col gap-8 rounded-md px-4 pt-6 pb-4',
        offline ? 'border border-border bg-surface-card text-ink' : 'bg-brand text-on-brand dark:bg-brand-tint dark:text-ink',
      )}
    >
      <div className={cn('flex flex-col', hero.kind === 'building' ? 'gap-3' : 'gap-1')}>
        <h2 className="text-title-2">{hero.title}</h2>
        {hero.kind === 'building' ? (
          hero.total != null && hero.total > 0 && (
            <BuildingProgress ready={hero.ready} total={hero.total} status={hero.status} />
          )
        ) : (
          <p className="text-body">{hero.meta}</p>
        )}
      </div>
      {topicId && (
        <StartButton
          topicId={topicId}
          placement={placement}
          variant="accent"
          size="lg"
          label={hero.play.accessibleLabel}
          disabled={hero.play.disabled || offline}
          describedBy={offline ? noticeId : undefined}
          className={cn('w-full sm:w-full', !offline && 'focus-visible:outline-on-brand dark:focus-visible:outline-brand')}
        >
          {hero.play.label}
        </StartButton>
      )}
    </section>
  )
}
