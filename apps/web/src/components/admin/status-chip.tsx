import {
  Archive, Ban, Check, CircleCheck, CircleDashed, CircleDot, Clock, File, Flag, Hourglass, Link,
  OctagonAlert, Radio, Shield,
} from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import { DashedAlert, HalfDisc } from '@/components/status-icons'
import { cn } from '@/lib/utils'

type ChipIcon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>

export type StatusTone = 'dashed' | 'tint' | 'settled' | 'strong' | 'muted' | 'mastered' | 'learning' | 'critical'

const TONE: Record<StatusTone, string> = {
  dashed: 'border-dashed border-border-strong bg-surface-card text-ink',
  tint: 'border-brand-tint bg-brand-tint text-ink [&>svg]:text-brand',
  settled: 'border-border-strong bg-surface-card text-ink',
  strong: 'border-surface-inverse bg-surface-inverse text-on-inverse',
  muted: 'border-border bg-surface-sunken text-ink-muted',
  mastered: 'border-transparent bg-feedback-correct-tint text-feedback-correct',
  learning: 'border-transparent bg-feedback-learning-tint text-feedback-learning',
  critical: 'border-ink bg-surface-card text-ink',
}

/** Operational status chip: icon + word, shape and ground carry emphasis (never hue alone). */
export function StatusChip({ tone, icon: Icon, children, className }: {
  tone: StatusTone
  icon: ChipIcon
  children: ReactNode
  className?: string
}) {
  return (
    <span
      data-slot="status-chip"
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border pr-2.5 pl-2 align-middle text-[13px]/[18px] font-semibold whitespace-nowrap',
        TONE[tone],
        className,
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      {children}
    </span>
  )
}

export const STATUS = {
  Invited: { tone: 'dashed', icon: Link },
  Queued: { tone: 'dashed', icon: Clock },
  Pending: { tone: 'dashed', icon: Clock },
  Unreviewed: { tone: 'dashed', icon: DashedAlert },
  'No documents yet': { tone: 'dashed', icon: File },
  Uploading: { tone: 'tint', icon: Hourglass },
  'Preparing training': { tone: 'tint', icon: Hourglass },
  'Generating questions': { tone: 'tint', icon: Hourglass },
  'Building curriculum': { tone: 'tint', icon: Hourglass },
  Active: { tone: 'settled', icon: CircleDot },
  Ready: { tone: 'settled', icon: CircleCheck },
  Done: { tone: 'settled', icon: CircleCheck },
  Live: { tone: 'settled', icon: Radio },
  Approved: { tone: 'settled', icon: CircleCheck },
  Failed: { tone: 'strong', icon: OctagonAlert },
  'Training failed': { tone: 'strong', icon: OctagonAlert },
  'Extraction failed': { tone: 'strong', icon: OctagonAlert },
  'Flagged by learner': { tone: 'strong', icon: Flag },
  Banned: { tone: 'strong', icon: Ban },
  Retired: { tone: 'muted', icon: Archive },
  Expired: { tone: 'muted', icon: Clock },
  Revoked: { tone: 'muted', icon: Ban },
  Rejected: { tone: 'muted', icon: Ban },
  Proficient: { tone: 'mastered', icon: Check },
  'Still learning': { tone: 'learning', icon: HalfDisc },
  Estimate: { tone: 'settled', icon: CircleDashed },
  Critical: { tone: 'critical', icon: Shield },
} as const satisfies Record<string, { tone: StatusTone; icon: ChipIcon }>

export function Status({ word, className }: { word: keyof typeof STATUS; className?: string }) {
  const { tone, icon } = STATUS[word]
  return <StatusChip tone={tone} icon={icon} className={className}>{word}</StatusChip>
}
