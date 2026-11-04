// One-question quick session: result copy plus the load/check state machine.
// The route owns rendering; this module owns the wording and the request order.
// Submission shape mirrors lib/session/answer.ts without importing it, so this
// module stays loadable in Jest without the api/auth runtime chain.
import {
  isAnswerReady,
  type Answer,
  type Draft,
  type ItemView,
  type Reveal,
  type SessionView,
  type SummaryView,
} from '@learnquiz/api'
import { revealModel, type RevealModel } from '@learnquiz/api/reveal'
import { checkFailedMessage } from '@learnquiz/api/system-copy'
import type { ApiOptions } from './api'

export type QuickResult = {
  variant: RevealModel['variant']
  heading: string
  answer: string
  chosen: string
  why: string | null
  counter: string | null
}

function leftToday(reviewsLeft: number): string {
  if (reviewsLeft <= 0) return 'none left today'
  if (reviewsLeft === 1) return '1 left today'
  return `${reviewsLeft} left today`
}

/** Result copy for the quick reveal. P states flow through the shared model. */
export function quickResult(reveal: Reveal, chosenTextValue: string, reviewsLeft: number | null): QuickResult {
  const model = revealModel(reveal, { hasCompany: false })
  const graded = reveal.state !== 'ungraded'
  const miss = graded && !reveal.correct
  return {
    variant: model.variant,
    heading: model.heading,
    answer: reveal.correctAnswer,
    chosen: chosenTextValue,
    why: miss ? reveal.chosenFeedback || reveal.explanation : null,
    counter: !graded || reviewsLeft === null ? null : reveal.correct ? `1 review cleared · ${leftToday(reviewsLeft)}` : leftToday(reviewsLeft),
  }
}

/** The learner's answer as display text, for every item format. */
export function chosenText(item: ItemView, answer: Answer): string {
  const textOf = (id: string): string | null => item.options.find((option) => option.id === id)?.text ?? null
  switch (item.format) {
    case 'mcq':
      return (answer.optionId !== undefined ? textOf(answer.optionId) : null) ?? ''
    case 'multi':
      return (answer.optionIds ?? []).map(textOf).filter((text): text is string => text !== null).join(', ')
    case 'cloze':
    case 'short':
      return (answer.text ?? '').trim()
    case 'order':
      return (answer.order ?? []).map(textOf).filter((text): text is string => text !== null).join(' → ')
  }
}

export type QuickSessionState =
  | { status: 'loading' }
  | { status: 'question' | 'checking'; session: SessionView; draft: Draft; error: string | null }
  | { status: 'done'; session: SessionView; reveal: Reveal; chosenText: string; reviewsLeft: number | null }
  | { status: 'error' | 'unavailable' | 'answered' }

export type QuickSessionOptions = {
  itemId: string
  pushId?: string
  request: <T>(path: string, options?: ApiOptions) => Promise<T>
  onChange: (state: QuickSessionState) => void
  onReveal?: (reveal: Reveal) => void
}

export type QuickSessionHandle = {
  getState(): QuickSessionState
  load(): Promise<void>
  changeDraft(draft: Draft): void
  check(): Promise<void>
  dispose(): void
}

type Submission = {
  itemId: string
  answer: Answer
  confidence: Draft['confidence']
  responseMs: number
}

// Exact answer shape of lib/session/answer.ts, kept local so this module has
// no runtime dependency on api/auth. Arrays are copied: the draft may change.
function submissionBody(item: ItemView, draft: Draft, responseMs: number): Submission {
  let answer: Answer
  switch (item.format) {
    case 'mcq': answer = { optionId: draft.answer.optionId }; break
    case 'multi': answer = { optionIds: draft.answer.optionIds?.slice() }; break
    case 'order': answer = { order: draft.answer.order?.slice() }; break
    case 'cloze':
    case 'short': answer = { text: draft.answer.text }; break
    default: answer = {}
  }
  return { itemId: item.id, answer, confidence: draft.confidence, responseMs }
}

// ApiError carries status, but importing it would pull in api/auth at runtime.
function statusOf(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status: unknown = (error as { status: unknown }).status
    return typeof status === 'number' ? status : null
  }
  return null
}

function answeredConflict(error: unknown): boolean {
  return error instanceof Error && /already answered|session has ended/i.test(error.message)
}

const ANSWER_TIMEOUT_MS = 130_000

export function createQuickSession(options: QuickSessionOptions): QuickSessionHandle {
  const { itemId, pushId, request, onChange, onReveal } = options
  let state: QuickSessionState = { status: 'loading' }
  let sessionId: string | null = null
  let submission: Submission | null = null
  let startedAt = 0
  let busy = false
  let disposed = false
  let revealed = false
  let current: AbortController | null = null

  function emit(next: QuickSessionState): void {
    state = next
    if (!disposed) onChange(next)
  }

  function aborted(controller: AbortController): boolean {
    return disposed || controller.signal.aborted
  }

  async function applySession(view: SessionView, previous: QuickSessionState, controller: AbortController): Promise<void> {
    if (view.ended || view.item === null) {
      // Auto-ending a retired/flagged mini session has zero answers.
      const summary = await request<SummaryView>(`/sessions/${encodeURIComponent(view.id)}/end`, {
        method: 'POST', signal: controller.signal,
      })
      if (aborted(controller)) return
      sessionId = null
      submission = null
      emit({ status: summary.total > 0 ? 'answered' : 'unavailable' })
      return
    }
    const keep = (previous.status === 'question' || previous.status === 'checking')
      && previous.session.item?.id === view.item.id ? previous.draft : null
    if (!keep) {
      startedAt = Date.now()
      submission = null
    }
    emit({ status: 'question', session: view, draft: keep ?? { answer: {}, confidence: null }, error: null })
  }

  async function load(): Promise<void> {
    if (disposed || busy) return
    if (state.status === 'checking' || state.status === 'done') return
    busy = true
    const controller = new AbortController()
    current = controller
    const previous = state
    emit({ status: 'loading' })
    try {
      if (sessionId === null) {
        const created = await request<{ sessionId: string }>('/sessions/quick', {
          body: pushId === undefined ? { itemId } : { itemId, pushId },
          signal: controller.signal,
        })
        if (aborted(controller)) return
        sessionId = created.sessionId
      }
      const view = await request<SessionView>(`/sessions/${encodeURIComponent(sessionId)}`, {
        signal: controller.signal,
      })
      if (aborted(controller)) return
      await applySession(view, previous, controller)
    } catch (error) {
      if (aborted(controller)) return
      const status = statusOf(error)
      if (status === 404) emit({ status: 'unavailable' })
      else if (status === 409) emit({ status: answeredConflict(error) ? 'answered' : 'unavailable' })
      else emit({ status: 'error' })
    } finally {
      if (current === controller) current = null
      busy = false
    }
  }

  function changeDraft(draft: Draft): void {
    if (disposed || state.status !== 'question') return
    submission = null
    emit({ ...state, draft, error: null })
  }

  async function finishSession(session: SessionView, reveal: Reveal, text: string): Promise<void> {
    try {
      // Ending persists the session even when navigation disposes this UI.
      const summary = await request<SummaryView>(`/sessions/${encodeURIComponent(session.id)}/end`, { method: 'POST' })
      if (disposed) return
      emit({ status: 'done', session, reveal, chosenText: text, reviewsLeft: summary.reviewsLeft })
    } catch {
      // The counter line stays hidden when the end call fails.
    }
  }

  async function check(): Promise<void> {
    if (disposed || state.status !== 'question') return
    const { session, draft } = state
    const item = session.item
    if (sessionId === null || !item || draft.confidence === null) return
    if (!isAnswerReady(item.format, draft.answer, item.options.length)) return
    const body = submission ?? submissionBody(item, draft, Math.max(0, Date.now() - startedAt))
    submission = body
    const controller = new AbortController()
    current = controller
    emit({ status: 'checking', session, draft, error: null })
    try {
      const reveal = await request<Reveal>(`/sessions/${encodeURIComponent(sessionId)}/answer`, {
        body,
        timeoutMs: ANSWER_TIMEOUT_MS,
        signal: controller.signal,
      })
      if (aborted(controller)) return
      const text = chosenText(item, draft.answer)
      emit({ status: 'done', session, reveal, chosenText: text, reviewsLeft: null })
      if (!revealed) {
        revealed = true
        onReveal?.(reveal)
      }
      void finishSession(session, reveal, text)
    } catch (error) {
      if (aborted(controller)) return
      const status = statusOf(error)
      if (status === 404) {
        submission = null
        emit({ status: 'unavailable' })
      } else if (status === 409) {
        submission = null
        try {
          const view = await request<SessionView>(`/sessions/${encodeURIComponent(sessionId)}`, { signal: controller.signal })
          if (aborted(controller)) return
          await applySession(view, { status: 'checking', session, draft, error: null }, controller)
        } catch (failure) {
          if (aborted(controller)) return
          emit({ status: statusOf(failure) === 404 ? 'unavailable' : 'error' })
        }
      } else {
        emit({ status: 'question', session, draft, error: checkFailedMessage(false, 'phone') })
      }
    } finally {
      if (current === controller) current = null
    }
  }

  function dispose(): void {
    disposed = true
    current?.abort()
    current = null
  }

  return { getState: () => state, load, changeDraft, check, dispose }
}
