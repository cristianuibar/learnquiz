import { motion, useReducedMotion } from 'motion/react'
import { Check, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { Reveal } from '@/lib/learning/types'

const HEADING = {
  A: 'Correct, you were sure',
  B: "Correct, but you weren't sure",
  C: 'Not quite, the answer is ',
  D: "You were sure, and it's wrong",
}

export function RevealCard({
  reveal,
  chosen,
  why,
  onWhy,
}: {
  reveal: Reveal
  chosen: string | null // what the learner picked or typed
  why: string
  onWhy: (v: string) => void
}) {
  const reduce = useReducedMotion()
  const { state } = reveal
  const wrong = !reveal.correct
  const quote = reveal.sourceQuote && (
    <blockquote className="mt-3 border-l-2 border-learning pl-3 text-sm text-muted-foreground">
      {reveal.sourceQuote}
    </blockquote>
  )
  return (
    <motion.section
      role="status"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'rounded-lg border p-5',
        wrong ? 'border-wrong bg-wrong-soft' : 'border-correct bg-correct-soft',
        state === 'D' && 'border-2',
      )}
    >
      <h2 className={cn('flex items-center gap-2 text-lg font-semibold', wrong ? 'text-wrong' : 'text-correct')}>
        {wrong ? <X className="size-5 shrink-0" aria-hidden /> : <Check className="size-5 shrink-0" aria-hidden />}
        {HEADING[state] + (state === 'C' ? reveal.correctAnswer : '')}
      </h2>
      {state === 'A' && (
        <>
          <p className="mt-2 text-lg font-medium">{reveal.correctAnswer}</p>
          <details className="mt-1">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Why</summary>
            <p>{reveal.explanation}</p>
            {quote}
          </details>
        </>
      )}
      {state !== 'A' && (
        <div className="mt-2">
          {state === 'D' && <p className="font-medium">The answer is {reveal.correctAnswer}</p>}
          {wrong && reveal.chosenFeedback && (
            <p className="mt-2">{(chosen ? `You chose ${chosen}: ` : '') + reveal.chosenFeedback}</p>
          )}
          <p className="mt-2">{reveal.explanation}</p>
          {quote}
          {state === 'D' && reveal.misconception && <p className="mt-3">{reveal.misconception}</p>}
          {wrong && (
            <div className="mt-4 flex flex-col gap-2">
              <Label htmlFor="why">In one line, why?</Label>
              <Input id="why" className="h-11 bg-background" value={why} maxLength={300} onChange={(e) => onWhy(e.target.value)} />
            </div>
          )}
          {reveal.returnsThisSession && <p className="mt-3 text-sm font-medium">This comes back later this session.</p>}
        </div>
      )}
    </motion.section>
  )
}
