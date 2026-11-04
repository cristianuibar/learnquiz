import { useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { errorMessage, RouteError } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { ItemPayload } from '@/lib/llm/schemas'
import { getQuestionReview, reviewQuestion } from '@/server/question-review'
import { Page, PageHeader } from '@/components/admin/page'
import { usePortalLinks } from '@/components/portal/portal-context'

export const Route = createFileRoute('/org/$slug/questions')({
  validateSearch: (search: Record<string, unknown>): { topicId?: string } => ({ topicId: typeof search.topicId === 'string' ? search.topicId : undefined }),
  loaderDeps: ({ search }) => ({ topicId: search.topicId }),
  loader: ({ params, deps }) => getQuestionReview({ data: { slug: params.slug, topicId: deps.topicId } }),
  errorComponent: RouteError,
  component: Questions,
})

type Question = Awaited<ReturnType<typeof getQuestionReview>>['concepts'][number]['questions'][number]

function QuestionCard({ question, slug }: { question: Question; slug: string }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [steps, setSteps] = useState(question.payload.options)
  const p = question.payload
  const typed = p.format === 'cloze' || p.format === 'short'
  const move = (i: number, d: number) => setSteps((s) => { const n = [...s]; [n[i], n[i + d]] = [n[i + d]!, n[i]!]; return n })
  const setStep = (i: number, k: 'text' | 'feedback', v: string) => setSteps((s) => s.map((o, j) => (j === i ? { ...o, [k]: v } : o)))

  async function act(action: 'approve' | 'edit' | 'retire', payload?: ItemPayload) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await reviewQuestion({ data: { slug, itemId: question.id, action, payload } })
      setEditing(false)
      await router.invalidate()
      setMessage(action === 'approve' ? 'Question approved.' : action === 'retire' ? 'Question retired.' : 'Changes saved. Review the question before approving it again.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
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
    void act('edit', {
      ...p, stem: text('stem'), explanation: text('explanation'), model_answer: text('model_answer'),
      difficulty: Number(f.get('difficulty')), source_quote: quote, grounded: quote !== null,
      accepted_answers: !typed ? p.accepted_answers : text('accepted_answers').split('\n').map((a) => a.trim()).filter(Boolean),
      options: p.format === 'order' ? steps.map((o, n) => ({ ...o, id: 'abcde'[n]!, text: o.text.trim(), feedback: o.feedback.trim(), is_correct: true }))
        : p.options.map((o, i) => ({ ...o, text: text(`option-${i}`), feedback: text(`feedback-${i}`), is_correct: p.format === 'multi' ? marked[i]! : text('correct') === String(i) })),
    })
  }

  return (
    <li className="flex flex-col gap-4 rounded-lg border p-4">
      <p className="text-caption text-ink-muted">
        {question.status === 'retired' ? 'Retired' : question.flags.length || question.status === 'reported' ? 'Flagged by learner' : question.status === 'active' ? 'Live' : 'Rejected'}
        {question.reviewedAt !== null ? ` · Approved ${new Date(question.reviewedAt).toLocaleDateString()}` : ' · Unreviewed'}
      </p>
      {question.flags.length > 0 && (
        <ul aria-label="Learner flags" className="flex flex-col gap-1 rounded-md border p-3 text-body">
          {question.flags.map((f, i) => (
            <li key={i}>
              <span className="font-medium">{f.label}</span>
              {f.note ? <> · {f.note}</> : null}
              <span className="text-ink-muted"> · {new Date(f.createdAt).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      )}
      <h4 className="font-semibold">{p.stem}</h4>
      {editing ? (
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
              <Button type="button" variant="secondary" onClick={() => { setEditing(false); setError('') }}>Cancel</Button>
            </div>
          </fieldset>
        </form>
      ) : (
        <>
          {p.options.length > 0 && <ul className="flex flex-col gap-2">{p.options.map((o) => <li key={o.id}><p>{o.text}{o.is_correct && ' (correct)'}</p><p className="text-caption text-ink-muted">{o.feedback}</p></li>)}</ul>}
          {typed && <p>Answer: {p.accepted_answers.join(', ') || p.model_answer}</p>}
          <p>{p.explanation}</p>
          {p.source_quote ? <blockquote className="border-l-2 pl-3 text-body"><p className="font-medium">Source quote</p>{p.source_quote}</blockquote> : <p className="text-caption text-ink-muted">No source quote</p>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || question.status === 'retired'} onClick={() => void act('approve')}>Approve</Button>
            <Button variant="secondary" disabled={busy} onClick={() => { setSteps(p.options); setEditing(true); setError(''); setMessage('') }}>Edit</Button>
            <Button variant="secondary" disabled={busy || question.status === 'retired'} onClick={() => void act('retire')}>Retire</Button>
          </div>
        </>
      )}
      {error && <p role="alert" className="text-body font-medium text-wrong">{error}</p>}
      <p role="status" className="text-body">{message}</p>
    </li>
  )
}

function Questions() {
  const review = Route.useLoaderData()
  const { slug } = Route.useParams()
  const links = usePortalLinks()
  return (
    <Page>
      <PageHeader crumbs={<Link {...links.overview} className="underline">{review.name}</Link>} title="Question review" />
      <nav aria-label="Topics" className="flex flex-wrap gap-4">
        {review.topics.map((t) => <Link key={t.id} {...links.questions({ topicId: t.id })} aria-current={review.topic?.id === t.id ? 'page' : undefined} className="underline">{t.title}</Link>)}
      </nav>
      {!review.topic ? <p>No company topics to review yet.</p> : (
        <section>
          <h2 className="text-title-2">{review.topic.title}</h2>
          {review.concepts.length === 0 && <p className="mt-4">No concepts to review yet.</p>}
          {review.concepts.map((c) => (
            <section key={c.id} className="mt-8">
              <h3 className="text-title-2">{c.name}</h3>
              {c.sourceQuote && <blockquote className="mt-3 border-l-2 pl-3 text-caption text-ink-muted">{c.sourceQuote}</blockquote>}
              {c.questions.length === 0 ? <p className="mt-4">No generated questions yet.</p> : <ul className="mt-4 flex flex-col gap-4">{c.questions.map((q) => <QuestionCard key={q.id} question={q} slug={slug} />)}</ul>}
            </section>
          ))}
        </section>
      )}
    </Page>
  )
}
