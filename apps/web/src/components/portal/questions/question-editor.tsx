import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { errorMessage } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { ItemPayload } from '@/lib/llm/schemas'
import { reviewQuestion } from '@/server/question-review'
import type { Question } from './question-row'

export function QuestionEditor({ question, slug, onDone }: { question: Question; slug: string; onDone: (saved: boolean) => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [steps, setSteps] = useState(question.payload.options)
  const p = question.payload
  const typed = p.format === 'cloze' || p.format === 'short'
  const move = (i: number, d: number) => setSteps((s) => { const n = [...s]; [n[i], n[i + d]] = [n[i + d]!, n[i]!]; return n })
  const setStep = (i: number, k: 'text' | 'feedback', v: string) => setSteps((s) => s.map((o, j) => (j === i ? { ...o, [k]: v } : o)))

  async function act(payload: ItemPayload) {
    setBusy(true)
    setError('')
    try {
      await reviewQuestion({ data: { slug, itemId: question.id, action: 'edit', payload } })
      await router.invalidate()
      onDone(true)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const text = (name: string) => String(f.get(name) ?? '').trim()
    const quote = text('source_quote') || null
    const marked = p.options.map((_, i) => f.get(`correct-${i}`) !== null)
    if (p.format === 'multi' && (marked.filter(Boolean).length < 2 || marked.every(Boolean))) { setError('Mark at least 2 correct answers and leave at least 1 incorrect.'); return }
    setError('')
    void act({
      ...p, stem: text('stem'), explanation: text('explanation'), model_answer: text('model_answer'),
      difficulty: Number(f.get('difficulty')), source_quote: quote, grounded: quote !== null,
      accepted_answers: !typed ? p.accepted_answers : text('accepted_answers').split('\n').map((a) => a.trim()).filter(Boolean),
      options: p.format === 'order' ? steps.map((o, n) => ({ ...o, id: 'abcde'[n]!, text: o.text.trim(), feedback: o.feedback.trim(), is_correct: true }))
        : p.options.map((o, i) => ({ ...o, text: text(`option-${i}`), feedback: text(`feedback-${i}`), is_correct: p.format === 'multi' ? marked[i]! : text('correct') === String(i) })),
    })
  }

  return (
    <form onSubmit={save}>
      <fieldset disabled={busy} className="flex flex-col gap-4">
        <legend className="mb-4 font-medium">Edit question</legend>
        <label className="flex flex-col gap-2">Question<Textarea name="stem" defaultValue={p.stem} maxLength={600} required autoFocus /></label>
        {p.format === 'order' ? steps.map((o, i) => (
          <fieldset key={o.id} className="flex flex-col gap-2 rounded-md border p-3">
            <legend>Step {i + 1}</legend>
            <label className="flex flex-col gap-2">Step text<Input value={o.text} onChange={(e) => setStep(i, 'text', e.target.value)} maxLength={300} required /></label>
            <label className="flex flex-col gap-2">Feedback<Textarea value={o.feedback} onChange={(e) => setStep(i, 'feedback', e.target.value)} maxLength={300} /></label>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>Move up</Button>
              <Button type="button" variant="secondary" aria-label={`Move step ${i + 1} down`} disabled={i === steps.length - 1} onClick={() => move(i, 1)}>Move down</Button>
            </div>
          </fieldset>
        )) : p.options.map((o, i) => (
          <fieldset key={o.id} className="flex flex-col gap-2 rounded-md border p-3">
            <legend>Answer {i + 1}</legend>
            <label className="flex flex-col gap-2">Answer text<Input name={`option-${i}`} defaultValue={o.text} maxLength={300} required /></label>
            {p.format === 'multi'
              ? <label className="flex items-center gap-2"><input type="checkbox" name={`correct-${i}`} defaultChecked={o.is_correct} />Correct answer</label>
              : <label className="flex items-center gap-2"><input type="radio" name="correct" value={i} defaultChecked={o.is_correct} required />Correct answer</label>}
            <label className="flex flex-col gap-2">Feedback<Textarea name={`feedback-${i}`} defaultValue={o.feedback} maxLength={300} /></label>
          </fieldset>
        ))}
        {typed && <label className="flex flex-col gap-2">Accepted answers (one per line)<Textarea name="accepted_answers" defaultValue={p.accepted_answers.join('\n')} required={p.format === 'cloze'} /></label>}
        <label className="flex flex-col gap-2">Model answer<Textarea name="model_answer" defaultValue={p.model_answer} maxLength={600} /></label>
        <label className="flex flex-col gap-2">Explanation<Textarea name="explanation" defaultValue={p.explanation} maxLength={400} /></label>
        <label className="flex flex-col gap-2">Difficulty (1–5)<Input type="number" name="difficulty" min={1} max={5} defaultValue={p.difficulty} required /></label>
        <label className="flex flex-col gap-2">Source quote<Textarea name="source_quote" defaultValue={p.source_quote ?? ''} maxLength={300} /></label>
        <p className="text-caption text-ink-muted">Keep a supporting passage from the source. Saving clears the previous approval.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit">Save changes</Button>
          <Button type="button" variant="secondary" onClick={() => onDone(false)}>Cancel</Button>
        </div>
      </fieldset>
      {error && <p role="alert" className="mt-4 text-body text-ink">{error}</p>}
    </form>
  )
}
