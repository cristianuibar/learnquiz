import { useEffect, useId, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { ReportSheet } from '@/components/report-sheet'
import { RevealSheet } from '@/components/reveal-sheet'
import { cn } from '@/lib/utils'
import type { Answer, ItemView, Reveal } from '@learnquiz/api'

const stay = (e: Event) => e.preventDefault()

// Modal over the answered question: the result sheet swaps to Report in place. Only Continue or a sent report closes it.
export function RevealOverlay({
  reveal,
  item,
  answer,
  hasCompany,
  company,
  busy,
  error,
  onContinue,
  onReportSent,
}: {
  reveal: Reveal
  item: ItemView
  answer: Answer
  hasCompany: boolean
  company?: string | null
  busy?: boolean
  error?: string | null
  onContinue(why: string): void
  onReportSent(why: string): void
}) {
  const reduce = useReducedMotion()
  const resultId = useId()
  const reportId = useId()
  const bandHeading = useRef<HTMLHeadingElement>(null)
  const reportLink = useRef<HTMLButtonElement>(null)
  const [mode, setMode] = useState<'result' | 'report'>('result')
  const [why, setWhy] = useState('')
  const [reported, setReported] = useState(false)
  const wasReport = useRef(false)

  // Back from Report: focus the link once the result content is unhidden (the band after a sent report, which hides the link).
  useEffect(() => {
    if (mode === 'report') wasReport.current = true
    else if (wasReport.current) {
      wasReport.current = false
      const target = reportLink.current ?? bandHeading.current
      target?.focus()
    }
  }, [mode])

  return (
    <DialogPrimitive.Root open modal onOpenChange={() => {}}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-scrim" />
        <DialogPrimitive.Content
          asChild
          aria-labelledby={mode === 'report' ? reportId : resultId}
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => { e.preventDefault(); bandHeading.current?.focus() }}
          onCloseAutoFocus={stay}
          onEscapeKeyDown={stay}
          onPointerDownOutside={stay}
          onInteractOutside={stay}
        >
          <motion.section
            initial={reduce ? false : { opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[calc(100dvh-48px)] max-w-md flex-col overflow-hidden rounded-t-lg bg-surface-card text-ink shadow-raised focus:outline-none"
          >
            <div hidden={mode === 'report'} className={cn('flex min-h-0 flex-1 flex-col', mode === 'report' && 'hidden')}>
              <RevealSheet
                reveal={reveal}
                item={item}
                answer={answer}
                hasCompany={hasCompany}
                busy={busy}
                error={error}
                headingId={resultId}
                headingRef={bandHeading}
                reportRef={reportLink}
                onContinue={onContinue}
                onReport={reported ? undefined : (reflection) => { setWhy(reflection); setMode('report') }}
              />
            </div>
            {mode === 'report' && (
              <ReportSheet
                itemId={item.id}
                attemptId={reveal.attemptId}
                company={company}
                headingId={reportId}
                onBack={() => setMode('result')}
                onSent={() => {
                  // Back on the result so a failed Continue shows its error and retries without reporting again.
                  setReported(true)
                  setMode('result')
                  onReportSent(why)
                }}
              />
            )}
          </motion.section>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
