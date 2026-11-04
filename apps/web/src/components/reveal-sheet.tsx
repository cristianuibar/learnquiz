import { useId, useState, type ReactNode, type Ref } from 'react'
import { Check, ChevronDown, Flag, Info, RotateCcw, ShieldAlert, X } from 'lucide-react'
import { ConceptDiagram } from '@/components/concept-diagram'
import { ErrorRow } from '@/components/question/error-row'
import { SourceQuote } from '@/components/source-quote'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { revealCopy, revealModel } from '@learnquiz/api/reveal'
import type { Answer, ItemView, Reveal } from '@learnquiz/api'

function HalfDisc({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}

const TONE = {
  correct: { ground: 'bg-feedback-correct-tint', disc: 'bg-feedback-correct text-on-feedback', text: 'text-feedback-correct', Icon: Check },
  wrong: { ground: 'bg-feedback-wrong-tint', disc: 'bg-feedback-wrong text-on-feedback', text: 'text-feedback-wrong', Icon: X },
  learning: { ground: 'bg-feedback-learning-tint', disc: 'bg-feedback-learning text-on-feedback', text: 'text-feedback-learning', Icon: HalfDisc },
  neutral: { ground: 'bg-surface-sunken', disc: 'bg-ink-muted text-surface-card', text: 'text-ink', Icon: Info },
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="list-decimal pl-6 text-body-lg">
      {items.map((text, i) => <li key={i}>{text}</li>)}
    </ol>
  )
}

function Row({ icon, label, children }: { icon?: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      {icon}
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-caption text-ink-muted">{label}</span>
        <div className="text-body-lg">{children}</div>
      </div>
    </div>
  )
}

function Disclosure({ label, open, onToggle, id }: { label: string; open: boolean; onToggle(): void; id: string }) {
  return (
    <Button variant="link" className="self-start" aria-expanded={open} aria-controls={id} onClick={onToggle}>
      {label}
      <ChevronDown aria-hidden className={cn('size-4 transition-transform', open && 'rotate-180')} />
    </Button>
  )
}

export function RevealSheet({
  reveal,
  item,
  answer,
  hasCompany,
  onContinue,
  onReport,
  busy,
  error,
  headingId,
  headingRef,
  reportRef,
}: {
  reveal: Reveal
  item: ItemView
  answer: Answer
  hasCompany: boolean
  onContinue(reflection: string): void
  onReport?(reflection: string): void // absent once a report has been sent
  busy?: boolean
  error?: string | null
  headingId: string
  headingRef: Ref<HTMLHeadingElement>
  reportRef: Ref<HTMLButtonElement>
}) {
  const model = revealModel(reveal, { hasCompany })
  const { variant } = model
  const tone = TONE[model.tone]
  const reflectionId = useId()
  const whyId = useId()
  const diagramId = useId()
  const [whyOpen, setWhyOpen] = useState(model.openByDefault)
  const [diagramOpen, setDiagramOpen] = useState(false)
  const [reflection, setReflection] = useState('')

  const optionText = (id: string) => item.options.find((o) => o.id === id)?.text ?? id
  const label = item.format === 'cloze' ? revealCopy.youWrote : item.format === 'short' ? revealCopy.yourAnswer : revealCopy.youChose
  const mine: ReactNode =
    item.format === 'mcq' ? (answer.optionId ? optionText(answer.optionId) : null)
    : item.format === 'multi' ? (answer.optionIds?.length
      ? <ul className="list-disc pl-6">{answer.optionIds.map((id) => <li key={id}>{optionText(id)}</li>)}</ul> : null)
    : item.format === 'order' ? (answer.order ? <Steps items={answer.order.map(optionText)} /> : null)
    : answer.text || null
  const correct: ReactNode = item.format === 'order'
    ? <Steps items={reveal.detail?.kind === 'order' ? reveal.detail.steps.map((s) => s.text) : reveal.correctAnswer.split(/\s*\/\s*/)} />
    : reveal.correctAnswer
  const quote = reveal.sourceQuote !== null && (
    <SourceQuote quote={reveal.sourceQuote} title={reveal.sourceTitle} version={reveal.sourceVersion} />
  )
  const explanation = <p className="text-body">{reveal.explanation}</p>
  const returns = reveal.returnsThisSession && (
    <p className="flex items-center gap-2 text-body text-ink-muted">
      <RotateCcw aria-hidden className="size-4 shrink-0" />
      {revealCopy.returnsThisSession}
    </p>
  )
  const pair = (
    <div className="flex flex-col gap-3">
      <Row icon={<Check aria-hidden className="mt-0.5 size-5 shrink-0 text-feedback-correct" />} label={revealCopy.theAnswer}>{correct}</Row>
      <Row icon={<X aria-hidden className="mt-0.5 size-5 shrink-0 text-feedback-wrong" />} label={label}>{mine}</Row>
    </div>
  )
  const shortExtras = item.format === 'short' && (
    <>
      {reveal.feedback && <p className="text-body">{reveal.feedback}</p>}
      {reveal.missingPoints.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-label">Missing points</h3>
          <ul className="list-disc pl-6 text-body">{reveal.missingPoints.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
    </>
  )

  const partialOptions = reveal.detail?.kind === 'multi' ? reveal.detail.options : []
  const partialLine = (id: string, text: string) => {
    const name = partialOptions.find((o) => o.id === id)?.text
    if (!name || !text.startsWith(name)) return text
    const lead = text.charAt(name.length) === ':' ? `${name}:` : name
    return <><strong className="font-semibold">{lead}</strong>{text.slice(lead.length)}</>
  }

  let body: ReactNode
  if (variant === 'correctSure' || variant === 'correctUnsure' || variant === 'noSource') {
    body = (
      <>
        <div className="text-body-lg">{correct}</div>
        {model.showWhy && <Disclosure label={revealCopy.why} open={whyOpen} onToggle={() => setWhyOpen(!whyOpen)} id={whyId} />}
        {whyOpen && (
          <div id={whyId} className="flex flex-col gap-4">
            {explanation}
            {quote}
          </div>
        )}
        {model.noQuoteLine && (
          <p className="flex items-center gap-2 text-caption text-ink-muted">
            <Info aria-hidden className="size-4 shrink-0" />
            {model.noQuoteLine}
          </p>
        )}
      </>
    )
  } else if (variant === 'ungraded') {
    body = (
      <>
        {mine && <Row label={label}>{mine}</Row>}
        <Row label={revealCopy.theAnswer}>{correct}</Row>
        {explanation}
        {quote}
      </>
    )
  } else if (variant === 'partial') {
    body = (
      <>
        {model.partialLines.length > 0 && (
          <ul className="flex flex-col gap-3">
            {model.partialLines.map((line) => {
              const Icon = line.icon === 'check' ? Check : X
              return (
                <li key={line.id} className="flex items-start gap-3">
                  <Icon aria-hidden className={cn('mt-0.5 size-5 shrink-0', line.icon === 'check' ? 'text-feedback-correct' : 'text-feedback-wrong')} />
                  <p className="text-body-lg">{partialLine(line.id, line.text)}</p>
                </li>
              )
            })}
          </ul>
        )}
        {quote}
        {returns}
      </>
    )
  } else if (variant === 'sureWrong') {
    const mixUps = reveal.mixUps
    body = (
      <>
        {pair}
        {shortExtras}
        {reveal.critical && (
          <p className="flex items-center gap-2 text-caption text-ink">
            <ShieldAlert aria-hidden className="size-4 shrink-0" />
            <span><strong>{revealCopy.criticalStep}</strong> · {revealCopy.comesBackFirst}</span>
          </p>
        )}
        {mixUps.length > 0 && (
          <div className="flex flex-col gap-1">
            <h3 className="text-label">{revealCopy.whyItFeltRight}</h3>
            {mixUps.length === 1
              ? <p className="text-body">{mixUps[0]}</p>
              : <ul className="list-disc pl-6 text-body">{mixUps.map((m) => <li key={m}>{m}</li>)}</ul>}
          </div>
        )}
        <div className="flex flex-col gap-1">
          <h3 className="text-label">{revealCopy.whatActuallyMatters}</h3>
          {explanation}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={reflectionId}>
            {revealCopy.reflection}
            <span className="text-caption text-ink-muted">{revealCopy.optional}</span>
          </Label>
          <Input
            id={reflectionId}
            maxLength={300}
            autoComplete="off"
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
          />
        </div>
        {quote}
        {returns}
      </>
    )
  } else {
    body = (
      <>
        {pair}
        {shortExtras}
        {reveal.chosenFeedback && <p className="text-body">{reveal.chosenFeedback}</p>}
        {explanation}
        {quote}
        {returns}
      </>
    )
  }

  return (
    <>
      <div aria-hidden className="absolute top-2 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-border-strong" />
      <div role="status" className={cn('flex items-center gap-3 px-4 pt-6 pb-4', tone.ground)}>
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', tone.disc)}>
          <tone.Icon aria-hidden className="size-5" />
        </span>
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className={cn('text-title-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand', tone.text)}
        >
          {model.heading}
        </h2>
        {model.counts
          ? <span className="ml-auto text-label text-ink tabular-nums">{model.counts}</span>
          : model.xpText && <span className="ml-auto text-label text-ink-muted tabular-nums">{model.xpText}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {body}
        {reveal.diagramConceptId && (
          <div className="flex flex-col gap-2">
            <Disclosure label="Concept diagram" open={diagramOpen} onToggle={() => setDiagramOpen(!diagramOpen)} id={diagramId} />
            {diagramOpen && <div id={diagramId}><ConceptDiagram conceptId={reveal.diagramConceptId} /></div>}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 border-t border-border px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
        {error && <ErrorRow message={error} />}
        <Button
          size="lg"
          className="w-full"
          disabled={busy}
          onClick={() => onContinue(variant === 'sureWrong' ? reflection.trim() : '')}
        >
          {model.continueLabel}
        </Button>
        {onReport && (
          <Button
            ref={reportRef}
            variant="link"
            className="text-ink-muted"
            disabled={busy}
            onClick={() => onReport(variant === 'sureWrong' ? reflection.trim() : '')}
          >
            <Flag aria-hidden className="size-4" />
            {revealCopy.report}
          </Button>
        )}
      </div>
    </>
  )
}
