import { Check, ChevronDown } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Status } from '@/components/admin/status-chip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { getQuestionReview } from '@/server/question-review'
import { QuestionDetails } from './question-details'

export type Review = Awaited<ReturnType<typeof getQuestionReview>>
export type Question = Review['units'][number]['concepts'][number]['questions'][number]

export const isFlagged = (q: Question) => q.status === 'reported' || q.flags.length > 0
export const isUnreviewed = (q: Question) => q.status === 'active' && q.reviewedAt === null && !isFlagged(q)
export const shortDate = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

function statusWord(q: Question): ComponentProps<typeof Status>['word'] {
  if (q.status === 'retired') return 'Retired'
  if (q.status === 'rejected') return 'Rejected'
  if (isFlagged(q)) return 'Flagged by learner'
  return q.reviewedAt === null ? 'Unreviewed' : 'Live'
}

export const stemId = (id: string) => `stem-${id}`
export const toggleId = (id: string) => `toggle-${id}`

export function QuestionRow({ question, critical, expanded, slug, onToggle, onApprove, onAnnounce }: {
  question: Question
  critical: boolean
  expanded: boolean
  slug: string
  onToggle: () => void
  onApprove: (id: string) => () => void
  onAnnounce: (message: string) => void
}) {
  const sid = stemId(question.id)
  const bodyId = `body-${question.id}`
  const toggle = (
    <Button
      id={toggleId(question.id)}
      variant="ghost"
      size="icon"
      aria-label={expanded ? 'Hide details' : 'Show details'}
      aria-expanded={expanded}
      aria-controls={bodyId}
      aria-describedby={sid}
      onClick={onToggle}
    >
      <ChevronDown aria-hidden className={cn('transition-transform', expanded && 'rotate-180')} />
    </Button>
  )
  return (
    <li className="flex flex-col">
      {expanded ? (
        <div className="flex items-start gap-3 pt-3 pr-2 pb-1 pl-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h4 id={sid} tabIndex={-1} className="text-body-lg font-semibold text-ink outline-none">{question.payload.stem}</h4>
            <div className="flex flex-wrap items-center gap-2">
              <Status word={statusWord(question)} />
              {critical ? <Status word="Critical" /> : null}
              <span className="inline-flex h-6 items-center rounded-sm bg-surface-sunken px-2 text-[13px]/[18px] font-semibold text-ink tabular-nums">{`Difficulty ${question.difficulty}`}</span>
            </div>
          </div>
          {toggle}
        </div>
      ) : (
        <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_44px] items-center gap-3 py-1.5 pr-2 pl-4 md:grid-cols-[168px_150px_minmax(0,1fr)_80px_44px]">
          <span className="justify-self-start max-md:hidden"><Status word={statusWord(question)} /></span>
          <span className="flex items-center gap-1 text-caption text-ink-muted max-md:hidden">
            {question.reviewedAt !== null ? <><Check aria-hidden className="size-4 shrink-0" />{`Approved ${shortDate(question.reviewedAt)}`}</> : null}
          </span>
          <h4 id={sid} tabIndex={-1} className="truncate text-body text-ink outline-none">{question.payload.stem}</h4>
          <span className="text-caption text-ink-muted tabular-nums max-md:hidden">{`Difficulty ${question.difficulty}`}</span>
          {toggle}
        </div>
      )}
      {expanded && (
        <div id={bodyId} className="px-4 pb-4">
          <QuestionDetails question={question} slug={slug} stemId={sid} onApprove={onApprove} onAnnounce={onAnnounce} />
        </div>
      )}
    </li>
  )
}
