import { useEffect, useId, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { FieldError, fieldProps } from '@/components/admin/field-error'
import { Status } from '@/components/admin/status-chip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { ItemPayload } from '@/lib/llm/schemas'
import { FORMAT } from './question-details'
import { statusWord, stemId, type Question, type Review } from './question-row'

const field = 'flex flex-col gap-2 text-label text-ink'
const legend = 'mb-3 text-label text-ink'
const DIFFICULTY = ['1', '2', '3', '4', '5'].map((value) => ({ value, label: value }))
const QUOTE_MISS = "This quote isn't in"

export function QuestionEditor({ question, sources, onSave, onCancel, busy, error }: {
  question: Question
  sources: Review['sources']
  onSave: (payload: ItemPayload, sourceId: string | undefined) => void
  onCancel: () => void
  busy: boolean
  error: string
}) {
  const p = question.payload
  const uid = useId()
  const headingId = stemId(question.id)
  const diffId = `${uid}-diff`
  const quoteId = `quote-${question.id}`
  const heading = useRef<HTMLHeadingElement>(null)
  const quote = useRef<HTMLTextAreaElement>(null)
  const [local, setLocal] = useState('')
  const [difficulty, setDifficulty] = useState(String(p.difficulty))
  const [opts, setOpts] = useState(p.options)
  const [correct, setCorrect] = useState(Math.max(0, p.options.findIndex((o) => o.is_correct)))
  const [answers, setAnswers] = useState(p.accepted_answers)
  const [draft, setDraft] = useState('')
  const known = sources.some((s) => s.id === question.sourceId)
  const [sourceId, setSourceId] = useState(known ? question.sourceId! : '')
  const quoteError = error.startsWith(QUOTE_MISS) ? error : ''
  const alert = local || (quoteError ? '' : error)

  useEffect(() => heading.current?.focus(), [])
  useEffect(() => { if (quoteError) quote.current?.focus() }, [quoteError])

  const move = (i: number, d: number) => setOpts((s) => { const n = [...s]; [n[i], n[i + d]] = [n[i + d]!, n[i]!]; return n })
  const setOpt = (i: number, k: 'text' | 'feedback', v: string) => setOpts((s) => s.map((o, j) => (j === i ? { ...o, [k]: v } : o)))
  const addOpt = () => setOpts((s) => [...s, { id: [...'abcde'].find((c) => !s.some((o) => o.id === c))!, text: '', feedback: '', is_correct: false }])
  const removeOpt = (i: number) => { setOpts((s) => s.filter((_, j) => j !== i)); setCorrect((c) => (c === i ? 0 : c > i ? c - 1 : c)) }
  const addAnswer = () => {
    const a = draft.trim()
    if (a && !answers.includes(a)) setAnswers((s) => [...s, a])
    setDraft('')
  }

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const text = (name: string) => String(f.get(name) ?? '').trim()
    const q = text('source_quote') || null
    const marked = p.options.map((_, i) => f.get(`correct-${i}`) !== null)
    if (p.format === 'multi' && (marked.filter(Boolean).length < 2 || marked.every(Boolean))) { setLocal('Mark at least 2 correct answers and leave at least 1 incorrect.'); return }
    if (p.format === 'short' && answers.length === 0) { setLocal('Add at least one accepted answer.'); return }
    setLocal('')
    onSave({
      ...p, stem: text('stem'), explanation: text('explanation'), model_answer: p.format === 'cloze' ? text('model_answer') : p.model_answer,
      difficulty: Number(difficulty), source_quote: q, grounded: q !== null,
      accepted_answers: p.format === 'short' ? answers : p.format === 'cloze' ? text('accepted_answers').split('\n').map((a) => a.trim()).filter(Boolean) : p.accepted_answers,
      options: p.format === 'order' ? opts.map((o, n) => ({ ...o, id: 'abcde'[n]!, text: o.text.trim(), feedback: o.feedback.trim(), is_correct: true }))
        : p.format === 'mcq' ? opts.map((o, i) => ({ ...o, text: o.text.trim(), feedback: o.feedback.trim(), is_correct: i === correct }))
        : p.format === 'short' ? []
        : p.options.map((o, i) => ({ ...o, text: text(`option-${i}`), feedback: text(`feedback-${i}`), is_correct: p.format === 'multi' ? marked[i]! : o.is_correct })),
    }, sourceId || undefined)
  }

  return (
    <form onSubmit={save} aria-labelledby={headingId}>
      <fieldset disabled={busy} className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4 border-b border-border pt-4 pb-3">
          <h4 id={headingId} ref={heading} tabIndex={-1} className="text-title-2 text-ink outline-none">Edit question</h4>
          <Status word={statusWord(question)} />
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <p className="flex flex-col gap-2 text-label text-ink">Type<span className="flex min-h-11 items-center text-body text-ink-muted">{FORMAT[p.format] ?? p.format}</span></p>
          <div className="flex flex-col gap-2">
            <span id={diffId} className="text-label text-ink">Difficulty</span>
            <Segmented mode="radiogroup" aria-labelledby={diffId} options={DIFFICULTY} value={difficulty} onValueChange={setDifficulty} className="self-start" />
          </div>
        </div>
        <label className={field}>Stem<Textarea name="stem" defaultValue={p.stem} maxLength={600} required /></label>
        {p.format === 'mcq' && (
          <fieldset className="flex flex-col gap-3">
            <legend className={legend}>Options</legend>
            {opts.map((o, i) => (
              <div key={o.id} className="grid grid-cols-[112px_minmax(0,1fr)_48px] items-center gap-x-3 gap-y-2 border-b border-border pb-3">
                <label className="flex min-h-11 items-center gap-2 text-label text-ink">
                  <input type="radio" name="correct" className="size-5 accent-brand" checked={correct === i} onChange={() => setCorrect(i)} />
                  Correct<span className="sr-only">{` answer: option ${i + 1}`}</span>
                </label>
                <Input aria-label={`Option ${i + 1}`} value={o.text} onChange={(e) => setOpt(i, 'text', e.target.value)} maxLength={300} required />
                {opts.length > 3 ? <Button type="button" variant="ghost" size="icon" aria-label={`Remove option ${i + 1}`} onClick={() => removeOpt(i)}><X aria-hidden /></Button> : <span aria-hidden />}
                <label htmlFor={`${uid}-fb${i}`} className="pl-8 text-caption text-ink-muted">Feedback<span className="sr-only">{` for option ${i + 1}`}</span></label>
                <Input id={`${uid}-fb${i}`} value={o.feedback} onChange={(e) => setOpt(i, 'feedback', e.target.value)} maxLength={300} />
                <span aria-hidden />
              </div>
            ))}
            {opts.length < 4 && <Button type="button" variant="ghost" className="self-start" onClick={addOpt}><Plus aria-hidden />Add option</Button>}
          </fieldset>
        )}
        {p.format === 'short' && (
          <fieldset className="flex flex-col gap-3">
            <legend className={legend}>Accepted answers</legend>
            <ul aria-label="Accepted answers" className="flex flex-wrap gap-2">
              {answers.map((a) => (
                <li key={a} className="flex items-center gap-1 rounded-full border border-border-strong bg-surface-sunken py-0.5 pr-0.5 pl-4 text-body text-ink">
                  {a}
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${a}`} onClick={() => setAnswers((s) => s.filter((x) => x !== a))}><X aria-hidden /></Button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              <Input aria-label="New accepted answer" className="max-w-90 flex-1" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAnswer() } }} />
              <Button type="button" variant="secondary" onClick={addAnswer}><Plus aria-hidden />Add answer</Button>
            </div>
          </fieldset>
        )}
        {p.format === 'order' && opts.map((o, i) => (
          <fieldset key={o.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <legend className="px-1 text-label text-ink">Step {i + 1}</legend>
            <label className={field}>Step text<Input value={o.text} onChange={(e) => setOpt(i, 'text', e.target.value)} maxLength={300} required /></label>
            <label className={field}>Feedback<Textarea value={o.feedback} onChange={(e) => setOpt(i, 'feedback', e.target.value)} maxLength={300} /></label>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="secondary" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>Move up</Button>
              <Button type="button" variant="secondary" aria-label={`Move step ${i + 1} down`} disabled={i === opts.length - 1} onClick={() => move(i, 1)}>Move down</Button>
            </div>
          </fieldset>
        ))}
        {p.format === 'multi' && p.options.map((o, i) => (
          <fieldset key={o.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <legend className="px-1 text-label text-ink">Answer {i + 1}</legend>
            <label className={field}>Answer text<Input name={`option-${i}`} defaultValue={o.text} maxLength={300} required /></label>
            <label className="flex min-h-11 items-center gap-2 text-label text-ink"><input type="checkbox" name={`correct-${i}`} className="size-5 accent-brand" defaultChecked={o.is_correct} />Correct answer</label>
            <label className={field}>Feedback<Textarea name={`feedback-${i}`} defaultValue={o.feedback} maxLength={300} /></label>
          </fieldset>
        ))}
        {p.format === 'cloze' && (
          <>
            <label className={field}>Accepted answers (one per line)<Textarea name="accepted_answers" defaultValue={p.accepted_answers.join('\n')} required /></label>
            <label className={field}>Model answer<Textarea name="model_answer" defaultValue={p.model_answer} maxLength={600} /></label>
          </>
        )}
        <label className={field}>Explanation<Textarea name="explanation" defaultValue={p.explanation} maxLength={400} /></label>
        <label className={field}>Source document
          <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            {!known && <option value="">Choose a document</option>}
            {sources.map((s) => <option key={s.id} value={s.id}>{`${s.title} v${s.version}`}</option>)}
          </Select>
        </label>
        <div className="flex flex-col gap-2">
          <label htmlFor={quoteId} className="text-label text-ink">Source quote</label>
          <Textarea id={quoteId} ref={quote} name="source_quote" defaultValue={p.source_quote ?? ''} maxLength={300} {...fieldProps(quoteId, quoteError)} />
          {quoteError && <FieldError id={quoteId}>{quoteError}</FieldError>}
        </div>
        {alert && <p role="alert" className="rounded-md border border-border-strong px-4 py-3 text-body text-ink">{alert}</p>}
        <p className="text-caption text-ink-muted">Saving clears the previous approval.</p>
        <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button type="submit">Save question</Button>
        </div>
      </fieldset>
    </form>
  )
}
