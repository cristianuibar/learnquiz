import type { Answer, Draft, ItemView, Reveal, RevealState, SessionView } from '@learnquiz/api'
import type { ApiOptions } from './api'
import { ApiError } from './api'
import { chosenText, createQuickSession, quickResult, type QuickSessionState } from './quick-result'

jest.mock('./auth', () => ({
  getToken: jest.fn((): string | null => null),
  handleUnauthorized: jest.fn((): Promise<void> => Promise.resolve()),
}))

beforeEach(() => jest.clearAllMocks())
afterEach(() => jest.restoreAllMocks())

const mcqItem: ItemView = {
  id: 'item-1', conceptId: 'concept-1', conceptName: 'Concept', format: 'mcq', stem: 'Which?',
  options: [{ id: 'a', text: 'Alpha' }, { id: 'b', text: 'Beta' }], blank: null, image: null, difficulty: 1,
}

function sessionWith(item: ItemView | null, ended = false): SessionView {
  return {
    id: 'session-1', kind: 'mini', topicId: 'topic-1', topicTitle: 'Topic',
    progress: { position: 1, total: 1 }, item, ended,
  }
}

function revealWith(state: RevealState, correct: boolean, overrides: Partial<Reveal> = {}): Reveal {
  const reveal: Reveal = {
    diagramConceptId: null, attemptId: 'attempt-1', state, correct, xp: 10, critical: false,
    correctOptionIds: null, detail: null, score: 1, feedback: null, missingPoints: [],
    correctAnswer: 'Alpha', chosenFeedback: null, explanation: 'Alpha comes first.',
    sourceQuote: 'Alpha is the documented answer.', sourceTitle: 'Shop manual', sourceVersion: 1,
    mixUps: [], returnsThisSession: false,
    pKnownBefore: 0.1, pKnownAfter: 0.2,
  }
  return Object.assign(reveal, overrides)
}

function setup() {
  const calls: { path: string; options: ApiOptions | undefined }[] = []
  const request = jest.fn((path: string, options?: ApiOptions): Promise<never> => {
    calls.push({ path, options })
    return currentHandler(path, options) as Promise<never>
  })
  let currentHandler: (path: string, options?: ApiOptions) => Promise<unknown> = async (path) => {
    throw new Error(`unhandled ${path}`)
  }
  const onRequest = (handler: (path: string, options?: ApiOptions) => Promise<unknown>): void => {
    currentHandler = handler
  }
  const states: QuickSessionState[] = []
  const onReveal = jest.fn()
  const handle = createQuickSession({
    itemId: 'item-1',
    request: request as <T>(path: string, options?: ApiOptions) => Promise<T>,
    onChange: (state) => { states.push(state) },
    onReveal,
  })
  return { handle, request, calls, states, onReveal, onRequest }
}

async function loadQuestion(helpers: ReturnType<typeof setup>, item: ItemView = mcqItem) {
  const { handle, onRequest } = helpers
  onRequest(async (path: string) => {
    if (path === '/sessions/quick') return { sessionId: 'session-1' }
    return sessionWith(item)
  })
  await handle.load()
  return helpers
}

type QuestionState = Extract<QuickSessionState, { status: 'question' | 'checking' }>
function last(states: QuickSessionState[], status: 'question' | 'checking'): QuestionState
function last(states: QuickSessionState[], status: 'done'): Extract<QuickSessionState, { status: 'done' }>
function last(states: QuickSessionState[], status: QuickSessionState['status']): QuickSessionState
function last(states: QuickSessionState[], status: QuickSessionState['status']): QuickSessionState {
  const found = states.filter((state) => state.status === status).pop()
  if (!found) throw new Error(`no ${status} state emitted`)
  return found
}

test.each<{ state: RevealState; variant: string; heading: string }>([
  { state: 'A', variant: 'correctSure', heading: 'Correct' },
  { state: 'B', variant: 'correctUnsure', heading: 'Correct' },
  { state: 'C', variant: 'notQuite', heading: 'Not quite' },
  { state: 'D', variant: 'sureWrong', heading: 'Not quite' },
  { state: 'P', variant: 'partial', heading: 'Partly right' },
  { state: 'ungraded', variant: 'ungraded', heading: 'Couldn’t grade this answer' },
])('state $state maps to variant $variant with its heading', ({ state, variant, heading }) => {
  const correct = state === 'A' || state === 'B'
  const result = quickResult(revealWith(state, correct), 'Alpha', 3)
  expect(result.variant).toBe(variant)
  expect(result.heading).toBe(heading)
  expect(result.answer).toBe('Alpha')
  expect(result.chosen).toBe('Alpha')
})

test.each([
  { left: 3, counter: '1 review cleared · 3 left today' },
  { left: 1, counter: '1 review cleared · 1 left today' },
  { left: 0, counter: '1 review cleared · none left today' },
])('a correct answer clears one review with $left left: $counter', ({ left, counter }) => {
  expect(quickResult(revealWith('A', true), 'Alpha', left).counter).toBe(counter)
})

test.each([
  { left: 3, counter: '3 left today' },
  { left: 1, counter: '1 left today' },
  { left: 0, counter: 'none left today' },
])('a miss shows only the reviews left with $left left: $counter', ({ left, counter }) => {
  expect(quickResult(revealWith('D', false), 'Beta', left).counter).toBe(counter)
})

test('a correct answer without a source quote maps to the no-source variant', () => {
  const result = quickResult(revealWith('A', true, { sourceQuote: null, sourceTitle: null }), 'Alpha', 3)
  expect(result.variant).toBe('noSource')
  expect(result.heading).toBe('Correct')
})

test('the counter is omitted without a count or for an ungraded answer', () => {
  expect(quickResult(revealWith('A', true), 'Alpha', null).counter).toBeNull()
  expect(quickResult(revealWith('D', false), 'Beta', null).counter).toBeNull()
  expect(quickResult(revealWith('ungraded', false), 'Beta', 3).counter).toBeNull()
})

test('the why line is the chosen feedback, falling back to the explanation', () => {
  expect(quickResult(revealWith('D', false, { chosenFeedback: 'Beta is a distractor.' }), 'Beta', 2).why).toBe('Beta is a distractor.')
  expect(quickResult(revealWith('C', false), 'Beta', 2).why).toBe('Alpha comes first.')
  expect(quickResult(revealWith('A', true), 'Alpha', 2).why).toBeNull()
  expect(quickResult(revealWith('ungraded', false), 'Beta', 2).why).toBeNull()
})

test.each<{ format: ItemView['format']; answer: Answer; text: string }>([
  { format: 'mcq', answer: { optionId: 'b' }, text: 'Beta' },
  { format: 'mcq', answer: {}, text: '' },
  { format: 'multi', answer: { optionIds: ['b', 'a', 'missing'] }, text: 'Beta, Alpha' },
  { format: 'cloze', answer: { text: '  typed  ' }, text: 'typed' },
  { format: 'short', answer: { text: '  My own words.  ' }, text: 'My own words.' },
  { format: 'order', answer: { order: ['b', 'a'] }, text: 'Beta → Alpha' },
  { format: 'order', answer: { order: ['b', 'missing'] }, text: 'Beta' },
  { format: 'order', answer: {}, text: '' },
])('chosen text for $format reads "$text"', ({ format, answer, text }) => {
  expect(chosenText({ ...mcqItem, format }, answer)).toBe(text)
})

test('loading is the initial state and is only emitted by load', async () => {
  const { handle, states, request , onRequest} = setup()
  expect(handle.getState()).toEqual({ status: 'loading' })
  expect(states).toEqual([])
  onRequest(async (path: string) => {
    if (path === '/sessions/quick') return { sessionId: 'session-1' }
    return sessionWith(mcqItem)
  })
  await handle.load()
  expect(states[0]).toEqual({ status: 'loading' })
  expect(last(states, 'question').error).toBeNull()
})

test('load creates the quick session and then reads it', async () => {
  const { handle, calls, states , onRequest} = await loadQuestion(setup())
  expect(calls.map((call) => call.path)).toEqual(['/sessions/quick', '/sessions/session-1'])
  expect(calls[0].options?.body).toEqual({ itemId: 'item-1' })
  const question = last(states, 'question')
  expect(question.session.item?.id).toBe('item-1')
  expect(question.draft).toEqual({ answer: {}, confidence: null })
  expect(handle.getState().status).toBe('question')
})

test('load sends the push id when the session comes from a notification', async () => {
  const calls: { path: string; options: ApiOptions | undefined }[] = []
  const states: QuickSessionState[] = []
  const handle = createQuickSession({
    itemId: 'item-1',
    pushId: 'push-1',
    request: (async (path: string, options?: ApiOptions) => {
      calls.push({ path, options })
      if (path === '/sessions/quick') return { sessionId: 'session-1' }
      return sessionWith(mcqItem)
    }) as <T>(path: string, options?: ApiOptions) => Promise<T>,
    onChange: (state) => { states.push(state) },
  })
  await handle.load()
  expect(calls[0].options?.body).toEqual({ itemId: 'item-1', pushId: 'push-1' })
  expect(last(states, 'question').session.item?.id).toBe('item-1')
})

test.each([
  { name: 'a missing question on create', failAt: '/sessions/quick', error: new ApiError(404, 'Question not found'), status: 'unavailable' },
  { name: 'a missing session on read', failAt: '/sessions/session-1', error: new ApiError(404, 'Not found'), status: 'unavailable' },
  { name: 'a conflict on read', failAt: '/sessions/session-1', error: new ApiError(409, 'Ended'), status: 'answered' },
  { name: 'a network failure', failAt: '/sessions/session-1', error: new ApiError(null, 'Network request failed'), status: 'error' },
] as const)('load maps $name to $status', async ({ failAt, error, status }) => {
  const { handle, states, request , onRequest} = setup()
  onRequest(async (path: string) => {
    if (path === failAt) throw error
    if (path === '/sessions/quick') return { sessionId: 'session-1' }
    return sessionWith(mcqItem)
  })
  await handle.load()
  expect(last(states, status as 'error').status).toBe(status)
})

test.each([
  { name: 'an ended session', view: sessionWith(mcqItem, true) },
  { name: 'a session without a current item', view: sessionWith(null) },
])('load maps $name to answered', async ({ view }) => {
  const { handle, states, request , onRequest} = setup()
  onRequest(async (path: string) => {
    if (path === '/sessions/quick') return { sessionId: 'session-1' }
    return view
  })
  await handle.load()
  expect(last(states, 'answered').status).toBe('answered')
})

test('concurrent loads create a single quick session', async () => {
  const { handle, request, calls , onRequest} = setup()
  let creations = 0
  onRequest(async (path: string) => {
    if (path === '/sessions/quick') {
      creations += 1
      await Promise.resolve()
      return { sessionId: 'session-1' }
    }
    return sessionWith(mcqItem)
  })
  await Promise.all([handle.load(), handle.load()])
  expect(creations).toBe(1)
  expect(calls.filter((call) => call.path === '/sessions/quick')).toHaveLength(1)
})

test('a retry after a read failure reuses the created session instead of duplicating it', async () => {
  const { handle, request, calls, states , onRequest} = setup()
  let reads = 0
  onRequest(async (path: string) => {
    if (path === '/sessions/quick') return { sessionId: 'session-1' }
    reads += 1
    if (reads === 1) throw new ApiError(null, 'Network request failed')
    return sessionWith(mcqItem)
  })
  await handle.load()
  expect(last(states, 'error').status).toBe('error')
  await handle.load()
  expect(last(states, 'question').session.id).toBe('session-1')
  expect(calls.filter((call) => call.path === '/sessions/quick')).toHaveLength(1)
  expect(calls.filter((call) => call.path === '/sessions/session-1')).toHaveLength(2)
})

test('load does nothing while checking or once done', async () => {
  const { handle, request, calls , onRequest} = await loadQuestion(setup())
  handle.changeDraft({ answer: { optionId: 'a' }, confidence: 'sure' })
  let release!: (reveal: Reveal) => void
  onRequest((path: string) => {
    if (path.endsWith('/answer')) return new Promise<Reveal>((resolve) => { release = resolve })
    if (path.endsWith('/end')) return Promise.resolve({ reviewsLeft: 2 })
    throw new Error(`unexpected ${path}`)
  })
  const checking = handle.check()
  await Promise.resolve()
  expect(handle.getState().status).toBe('checking')
  const callsDuringCheck = calls.length
  await handle.load()
  expect(calls.length).toBe(callsDuringCheck)
  release(revealWith('A', true))
  await checking
  await Promise.resolve()
  expect(handle.getState().status).toBe('done')
  const callsWhenDone = calls.length
  await handle.load()
  expect(calls.length).toBe(callsWhenDone)
})

test('changeDraft keeps the new selection and clears a check failure', async () => {
  const { handle, request, states , onRequest} = await loadQuestion(setup())
  onRequest(async (path: string) => {
    if (path.endsWith('/answer')) throw new ApiError(null, 'Network request failed')
    throw new Error(`unexpected ${path}`)
  })
  handle.changeDraft({ answer: { optionId: 'b' }, confidence: 'sure' })
  await handle.check()
  expect(last(states, 'question').error).toBe('Couldn’t check your answer.')
  const retry = { answer: { optionId: 'a' }, confidence: 'guess' } as const
  handle.changeDraft({ ...retry })
  const cleared = last(states, 'question')
  expect(cleared.error).toBeNull()
  expect(cleared.draft).toEqual(retry)
})

test('changeDraft is ignored outside the question state', async () => {
  const untouched = setup()
  untouched.handle.changeDraft({ answer: { optionId: 'a' }, confidence: 'sure' })
  expect(untouched.states).toEqual([])

  const { handle, states , onRequest} = await loadQuestion(setup())
  handle.changeDraft({ answer: { optionId: 'a' }, confidence: 'sure' })
  let release!: (reveal: Reveal) => void
  onRequest((path: string) => {
    if (path.endsWith('/answer')) return new Promise<Reveal>((resolve) => { release = resolve })
    if (path.endsWith('/end')) return Promise.resolve({ reviewsLeft: 2 })
    throw new Error(`unexpected ${path}`)
  })
  const pending = handle.check()
  await Promise.resolve()
  expect(handle.getState().status).toBe('checking')
  const draftCount = states.length
  handle.changeDraft({ answer: { optionId: 'b' }, confidence: 'guess' })
  expect(states.length).toBe(draftCount)
  expect(handle.getState()).toMatchObject({ status: 'checking', draft: { answer: { optionId: 'a' }, confidence: 'sure' } })
  release(revealWith('A', true))
  await pending
})

test.each<{ name: string; draft: Draft }>([
  { name: 'without confidence', draft: { answer: { optionId: 'a' }, confidence: null } },
  { name: 'without a selection', draft: { answer: {}, confidence: 'sure' } },
  { name: 'with a half-filled order', draft: { answer: { order: ['b'] }, confidence: 'sure' } },
])('check does nothing $name', async ({ draft }) => {
  const { handle, request, states , onRequest} = await loadQuestion(setup())
  handle.changeDraft({ ...draft })
  await handle.check()
  expect(request.mock.calls.filter(([path]: [string, unknown?]) => path.endsWith('/answer'))).toHaveLength(0)
  expect(handle.getState().status).toBe('question')
  expect(states.some((state) => state.status === 'checking')).toBe(false)
})

test('a second check while checking sends no duplicate answer', async () => {
  const { handle, request, states , onRequest} = await loadQuestion(setup())
  handle.changeDraft({ answer: { optionId: 'a' }, confidence: 'sure' })
  let release!: (reveal: Reveal) => void
  onRequest((path: string) => {
    if (path.endsWith('/answer')) return new Promise<Reveal>((resolve) => { release = resolve })
    if (path.endsWith('/end')) return Promise.resolve({ reviewsLeft: 2 })
    throw new Error(`unexpected ${path}`)
  })
  const first = handle.check()
  const second = handle.check()
  await Promise.resolve()
  expect(last(states, 'checking').status).toBe('checking')
  release(revealWith('A', true))
  await Promise.all([first, second])
  expect(request.mock.calls.filter(([path]: [string, unknown?]) => path.endsWith('/answer'))).toHaveLength(1)
})

test('a correct check publishes done at once, fires once, then fills the counter from end', async () => {
  const { handle, request, calls, states, onReveal , onRequest} = await loadQuestion(setup())
  const reveal = revealWith('B', true, { xp: 5 })
  let finish!: (summary: { reviewsLeft: number }) => void
  onRequest(async (path: string) => {
    if (path.endsWith('/answer')) return reveal
    if (path.endsWith('/end')) {
      expect(handle.getState()).toMatchObject({ status: 'done', reveal, reviewsLeft: null })
      expect(onReveal).toHaveBeenCalledTimes(1)
      return new Promise<{ reviewsLeft: number }>((resolve) => { finish = resolve })
    }
    throw new Error(`unexpected ${path}`)
  })
  handle.changeDraft({ answer: { optionId: 'a' }, confidence: 'unsure' })
  const pending = handle.check()
  await Promise.resolve()
  expect(handle.getState()).toMatchObject({ status: 'done', reviewsLeft: null })
  finish({ reviewsLeft: 3 })
  await pending
  const answerCall = calls.find((call) => call.path.endsWith('/answer'))!
  expect(answerCall.path).toBe('/sessions/session-1/answer')
  expect(answerCall.options?.body).toEqual({
    itemId: 'item-1', answer: { optionId: 'a' }, confidence: 'unsure', responseMs: expect.any(Number),
  })
  const published = states.filter((state) => state.status === 'done')
  expect(published[0]).toMatchObject({ reveal, chosenText: 'Alpha', reviewsLeft: null })
  expect(published[published.length - 1]).toMatchObject({ reviewsLeft: 3 })
  expect(onReveal).toHaveBeenCalledTimes(1)
  expect(onReveal).toHaveBeenCalledWith(reveal)
  const endCall = calls.find((call) => call.path.endsWith('/end'))!
  expect(endCall.options?.method).toBe('POST')
})

test('a miss keeps the selection text and notifies the reveal once', async () => {
  const { handle, request, states, onReveal , onRequest} = await loadQuestion(setup())
  const reveal = revealWith('D', false, { chosenFeedback: 'Beta is wrong.' })
  onRequest(async (path: string) => {
    if (path.endsWith('/answer')) return reveal
    if (path.endsWith('/end')) return { reviewsLeft: 1 }
    throw new Error(`unexpected ${path}`)
  })
  handle.changeDraft({ answer: { optionId: 'b' }, confidence: 'sure' })
  await handle.check()
  expect(last(states, 'done')).toMatchObject({ chosenText: 'Beta', reviewsLeft: 1 })
  expect(onReveal).toHaveBeenCalledTimes(1)
  expect(onReveal).toHaveBeenCalledWith(reveal)
})

test('an order answer is submitted in full and read back in order', async () => {
  const orderItem: ItemView = { ...mcqItem, format: 'order' }
  const { handle, request, calls, states, onRequest } = await loadQuestion(setup(), orderItem)
  onRequest(async (path: string) => {
    if (path.endsWith('/answer')) return revealWith('A', true)
    if (path.endsWith('/end')) return { reviewsLeft: 0 }
    throw new Error(`unexpected ${path}`)
  })
  handle.changeDraft({ answer: { order: ['b', 'a'] }, confidence: 'sure' })
  await handle.check()
  expect(calls.find((call) => call.path.endsWith('/answer'))?.options?.body).toEqual({
    itemId: 'item-1', answer: { order: ['b', 'a'] }, confidence: 'sure', responseMs: expect.any(Number),
  })
  expect(last(states, 'done')).toMatchObject({ chosenText: 'Beta → Alpha', reviewsLeft: 0 })
})

test('a failed end call leaves the done state without a counter', async () => {
  const { handle, request, states, onReveal , onRequest} = await loadQuestion(setup())
  onRequest(async (path: string) => {
    if (path.endsWith('/answer')) return revealWith('A', true)
    throw new ApiError(null, 'Network request failed')
  })
  handle.changeDraft({ answer: { optionId: 'a' }, confidence: 'sure' })
  await handle.check()
  expect(last(states, 'done')).toMatchObject({ reviewsLeft: null })
  expect(onReveal).toHaveBeenCalledTimes(1)
})

test('a failed check keeps the selection and replays the exact submission on Try again', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(1000)
  const { handle, request, calls, states , onRequest} = await loadQuestion(setup())
  let attempts = 0
  onRequest(async (path: string) => {
    if (path.endsWith('/answer')) {
      attempts += 1
      if (attempts === 1) throw new ApiError(null, 'Network request failed')
      return revealWith('A', true)
    }
    if (path.endsWith('/end')) return { reviewsLeft: 2 }
    throw new Error(`unexpected ${path}`)
  })
  const draft: Draft = { answer: { optionId: 'b' }, confidence: 'sure' }
  handle.changeDraft({ ...draft })
  now.mockReturnValue(2000)
  await handle.check()
  const failed = last(states, 'question')
  expect(failed.error).toBe('Couldn’t check your answer.')
  expect(failed.draft).toEqual(draft)
  now.mockReturnValue(5000)
  await handle.check()
  const bodies = calls.filter((call) => call.path.endsWith('/answer')).map((call) => call.options?.body)
  expect(bodies).toHaveLength(2)
  expect(bodies[0]).toEqual({
    itemId: 'item-1', answer: { optionId: 'b' }, confidence: 'sure', responseMs: 1000,
  })
  expect(bodies[1]).toEqual(bodies[0])
  expect(last(states, 'done').reviewsLeft).toBe(2)
})

test('check maps a missing session to unavailable and a conflict to answered', async () => {
  for (const [error, status] of [
    [new ApiError(404, 'Not found'), 'unavailable'],
    [new ApiError(409, 'Already answered'), 'answered'],
  ] as const) {
    const { handle, request, states , onRequest} = await loadQuestion(setup())
    onRequest(async (path: string) => {
      if (path.endsWith('/answer')) throw error
      throw new Error(`unexpected ${path}`)
    })
    handle.changeDraft({ answer: { optionId: 'a' }, confidence: 'sure' })
    await handle.check()
    expect(last(states, status).status).toBe(status)
  }
})

test('check does nothing once done', async () => {
  const { handle, request , onRequest} = await loadQuestion(setup())
  onRequest(async (path: string) => {
    if (path.endsWith('/answer')) return revealWith('A', true)
    if (path.endsWith('/end')) return { reviewsLeft: 0 }
    throw new Error(`unexpected ${path}`)
  })
  handle.changeDraft({ answer: { optionId: 'a' }, confidence: 'sure' })
  await handle.check()
  const answerCalls = request.mock.calls.filter(([path]: [string, unknown?]) => path.endsWith('/answer')).length
  await handle.check()
  expect(request.mock.calls.filter(([path]: [string, unknown?]) => path.endsWith('/answer'))).toHaveLength(answerCalls)
})

test('dispose aborts the in-flight check and suppresses its late publish', async () => {
  const { handle, request, states, onReveal , onRequest} = await loadQuestion(setup())
  let release!: (reveal: Reveal) => void
  let seenSignal: AbortSignal | null = null
  onRequest((path: string, options?: ApiOptions) => {
    if (path.endsWith('/answer')) {
      seenSignal = options?.signal ?? null
      return new Promise<Reveal>((resolve) => { release = resolve })
    }
    throw new Error(`unexpected ${path}`)
  })
  handle.changeDraft({ answer: { optionId: 'a' }, confidence: 'sure' })
  const pending = handle.check()
  await Promise.resolve()
  const emitted = states.length
  handle.dispose()
  expect((seenSignal as AbortSignal | null)?.aborted).toBe(true)
  release(revealWith('A', true))
  await pending
  await Promise.resolve()
  expect(states.length).toBe(emitted)
  expect(onReveal).not.toHaveBeenCalled()
  expect(handle.getState().status).toBe('checking')
})

test('dispose aborts the end call and suppresses its late counter', async () => {
  const { handle, request, states , onRequest} = await loadQuestion(setup())
  let releaseEnd!: (summary: { reviewsLeft: number }) => void
  onRequest((path: string) => {
    if (path.endsWith('/answer')) return Promise.resolve(revealWith('A', true))
    if (path.endsWith('/end')) return new Promise<{ reviewsLeft: number }>((resolve) => { releaseEnd = resolve })
    throw new Error(`unexpected ${path}`)
  })
  handle.changeDraft({ answer: { optionId: 'a' }, confidence: 'sure' })
  const pending = handle.check()
  await Promise.resolve()
  await Promise.resolve()
  expect(handle.getState().status).toBe('done')
  const emitted = states.length
  handle.dispose()
  releaseEnd({ reviewsLeft: 3 })
  await pending
  await Promise.resolve()
  expect(states.length).toBe(emitted)
  expect(handle.getState()).toMatchObject({ status: 'done', reviewsLeft: null })
})
