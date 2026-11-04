// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Route as playRoute } from '@/routes/play.$sessionId'
import { Route as appRootRoute } from '@/routes/__root'
import { answerItem, endSession, getSession, nextItem, prepareNextSession, reportItem, transcribeAnswer } from '@/server/play'
import { getModelTrace } from '@/server/model-trace'
import { generateConceptDiagram } from '@/server/diagrams'
import type { ItemView, Reveal, SessionView } from '@learnquiz/api'

vi.mock('motion/react', async (original) => ({ ...(await original<typeof import('motion/react')>()), useReducedMotion: () => true }))
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('@/server/play', () => ({ prepareNextSession: vi.fn(async () => ({ ok: true })), answerItem: vi.fn(), getSession: vi.fn(), transcribeAnswer: vi.fn(), nextItem: vi.fn(), endSession: vi.fn(), reportItem: vi.fn() }))
vi.mock('@/server/model-trace', () => ({ getModelTrace: vi.fn() }))
vi.mock('@/server/diagrams', () => ({ generateConceptDiagram: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ authClient: {} }))
vi.mock('@/server/org-settings', () => ({ getCompanyBranding: async () => null }))
vi.mock('@/server/latest-topic', () => ({ getLatestTopicIdFn: async () => 't1' }))
vi.mock('@/server/session-fn', () => ({ getSessionFn: async () => ({ user: { id: 'u1', name: 'Learner', isAnonymous: false }, facebookEnabled: false, needsDisclosure: false, adminCompanies: [] }) }))

let stopTrack: ReturnType<typeof vi.fn>
let finishPermission: ((stream: MediaStream) => void) | undefined
beforeEach(() => {
  vi.mocked(generateConceptDiagram).mockReset().mockResolvedValue({ status: 'ready', image: { src: '/media/concepts/c1', alt: 'Subtract equal amounts from both sides.' } })
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: query.includes('prefers-reduced-motion'), media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); finishPermission = undefined; sessionStorage.clear() })

async function renderPlay(voiceEnabled: boolean | null = true, permissionPending = false, format: 'cloze' | 'short' | 'mcq' = 'cloze', fromToday = false, overrides: Partial<ItemView> = {}, basics = false) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  stopTrack = vi.fn()
  const mic = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(() => permissionPending
    ? new Promise<MediaStream>((resolve) => { finishPermission = resolve }) : Promise.resolve(mic)) } })
  vi.stubGlobal('MediaRecorder', class {
    state = 'inactive'
    mimeType = 'audio/webm;codecs=opus'
    ondataavailable?: (event: { data: Blob }) => void
    onstop?: () => void
    start() { this.state = 'recording' }
    stop() {
      this.state = 'inactive'
      this.ondataavailable?.({ data: new Blob(['encoded audio']) })
      void this.onstop?.()
    }
  })
  // Browser codecs/audio rendering are the external boundary. The application
  // still encodes its WAV and submits the real upload shape.
  vi.stubGlobal('AudioContext', class {
    decodeAudioData() { return Promise.resolve({ duration: 1 }) }
    close() { return Promise.resolve() }
  })
  vi.stubGlobal('OfflineAudioContext', class {
    destination = {}
    createBufferSource() { return { buffer: null, connect() {}, start() {} } }
    startRendering() { return Promise.resolve({ getChannelData: () => new Float32Array(24_000).fill(0.25) }) }
  })
  const initial: SessionView = {
    id: 's1', kind: 'session', topicId: 't1', topicTitle: 'Algebra', progress: { position: 1, total: 1 }, ended: false,
    ...(voiceEnabled === null ? {} : { voiceEnabled }),
    ...(basics ? { basics } : {}),
    item: {
      id: 'i1', conceptId: 'c1', conceptName: 'Variables', format, difficulty: 1, generatedBy: 'gpt-test', image: null,
      stem: format === 'short' ? 'Explain why subtracting one preserves equality.' : format === 'mcq' ? 'x + 1 = 2; what is x?' : 'x + 1 = 2; x = ____',
      options: format === 'mcq' ? [{ id: 'a', text: '2' }, { id: 'b', text: '1' }] : [], blank: format === 'cloze' ? { numeric: true } : null, ...overrides,
    },
  }
  vi.mocked(getSession).mockResolvedValue(initial)
  vi.mocked(transcribeAnswer).mockReset().mockResolvedValue('one')
  vi.mocked(answerItem).mockReset().mockResolvedValue({ attemptId: 'a0', diagramConceptId: null, score: 1, feedback: null, missingPoints: [], chosenFeedback: null, sourceQuote: null, sourceTitle: null, returnsThisSession: false, pKnownBefore: 0.1, pKnownAfter: 0.5, correct: true, correctAnswer: '1', state: 'A', mixUps: [], explanation: 'Subtract one.', xp: 10, critical: false, correctOptionIds: null, sourceVersion: null, detail: null } as unknown as Reveal)
  vi.mocked(nextItem).mockReset()
  const rootRoute = createRootRoute({ beforeLoad: appRootRoute.options.beforeLoad, loader: appRootRoute.options.loader, component: Outlet })
  const play = createRoute({ getParentRoute: () => rootRoute, path: '/play/$sessionId', loader: playRoute.options.loader, gcTime: playRoute.options.gcTime, component: playRoute.options.component })
  const today = createRoute({ getParentRoute: () => rootRoute, path: '/today', component: () => <p>Today page</p> })
  const router = createRouter({
    routeTree: rootRoute.addChildren([play, today]),
    history: createMemoryHistory(fromToday ? { initialEntries: ['/today', '/play/s1'], initialIndex: 1 } : { initialEntries: ['/play/s1'] }),
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { await router.load(); root.render(<RouterProvider router={router} />) })
  return { container, mic, initial, router, async cleanup() {
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  } }
}
// happy-dom's :disabled ignores a disabled ancestor fieldset, which browsers honour.
const locked = (el: HTMLElement): boolean => {
  const fieldset = el.parentElement?.closest('fieldset')
  return (el as HTMLInputElement).disabled || Boolean(fieldset && (fieldset.disabled || locked(fieldset)))
}
// The reveal overlay portals into document.body, so buttons are found there.
const button = (_container: HTMLElement, label: string) => [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!
const byLabel = (container: HTMLElement, label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
function type(el: HTMLElement, value: string) {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
const click = (el: HTMLElement | null | undefined) => act(async () => el!.click())

it('keeps an unsent answer and confidence across a reload and clears them after Check', async () => {
  const typeAndRate = async (container: HTMLElement) => act(async () => {
    const input = container.querySelector<HTMLInputElement>('#answer')!
    type(input, 'one more')
    container.querySelector<HTMLInputElement>('input[value="unsure"]')!.click()
  })
  const first = await renderPlay(false, false, 'short')
  await typeAndRate(first.container)
  await first.cleanup()

  const reloaded = await renderPlay(false, false, 'short')
  try {
    expect(reloaded.container.querySelector<HTMLInputElement>('#answer')!.value).toBe('one more')
    expect(reloaded.container.querySelector<HTMLInputElement>('input[value="unsure"]')!.checked).toBe(true)
    vi.mocked(nextItem).mockResolvedValue({ ...reloaded.initial, progress: { position: 2, total: 2 }, item: { ...reloaded.initial.item!, id: 'i2', stem: 'Why subtract from both sides?' } })
    await act(async () => { button(reloaded.container, 'Check').click() })
    expect(answerItem).toHaveBeenCalledWith({ data: expect.objectContaining({ itemId: 'i1', answer: { text: 'one more' }, confidence: 'unsure' }) })
    expect(sessionStorage.length).toBe(0)
    await act(async () => { button(reloaded.container, 'Continue').click() })
    expect(reloaded.container.querySelector<HTMLInputElement>('#answer')!.value).toBe('')
    expect(reloaded.container.querySelector<HTMLInputElement>('input[value="unsure"]')!.checked).toBe(false)
  } finally { await reloaded.cleanup() }
})

it.each([
  { format: 'mcq', repeats: false },
  { format: 'cloze', repeats: false },
  { format: 'short', repeats: false },
  { format: 'cloze', repeats: true },
] as const)('focuses the next $format question after Continue (repeats: $repeats)', async ({ format, repeats }) => {
  const { container, initial, cleanup } = await renderPlay(false)
  const nextView: SessionView = {
    ...initial,
    progress: { position: 2, total: 2 },
    item: repeats ? initial.item : { ...initial.item!, id: 'i2', format, stem: 'What is 2 + 2?', options: format === 'mcq' ? [{ id: 'four', text: '4' }, { id: 'five', text: '5' }] : [] },
  }
  if (repeats) {
    const reveal = {
      attemptId: 'a1', diagramConceptId: null, correct: false, correctAnswer: '1', state: 'C' as const, mixUps: [], explanation: 'Subtract one.',
      score: 0, feedback: null, missingPoints: [],
      xp: 0, critical: false, correctOptionIds: null, sourceVersion: null, detail: null,
      chosenFeedback: null, sourceQuote: null, sourceTitle: null, returnsThisSession: true, pKnownBefore: 0.1, pKnownAfter: 0.05,
    }
    vi.mocked(answerItem).mockResolvedValueOnce(reveal)
  }
  vi.mocked(nextItem).mockReset().mockResolvedValue(nextView)
  try {
    await act(async () => {
      const input = container.querySelector<HTMLInputElement>('#answer')!
      type(input, repeats ? '0' : '1')
      container.querySelector<HTMLInputElement>(`input[value="${repeats ? 'unsure' : 'sure'}"]`)!.click()
    })
    await act(async () => { button(container, 'Check').click() })
    if (repeats) {
      expect(document.querySelector('[role="dialog"]')!.textContent).toContain('Subtract one.')
    }
    await act(async () => {
      const next = button(container, 'Continue')
      next.focus()
      next.click()
    })
    expect(nextItem).toHaveBeenCalledWith({ data: { sessionId: 's1', why: undefined } })
    if (nextView.item!.format === 'cloze') {
      expect(document.activeElement).toBe(container.querySelector('#answer'))
    } else {
      expect(document.activeElement?.textContent).toBe(nextView.item!.stem)
      expect(document.activeElement?.tagName).toBe('H1')
    }
    expect(button(container, 'Check').disabled).toBe(true)
  } finally { await cleanup() }
})

it('records on tap, uploads WAV on stop, lets the learner edit the transcript, and checks the edited answer', async () => {
  const { container, cleanup } = await renderPlay(true, false, 'short')
  try {
    expect(prepareNextSession).toHaveBeenCalledWith({ data: { sessionId: 's1' } })
    expect(container.textContent).toContain('Tap to record')
    expect(button(container, 'Type instead')).toBeDefined()
    await click(byLabel(container, 'Record answer'))
    const stop = byLabel(container, 'Stop recording')!
    expect(stop.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('[role="status"]')!.textContent).toContain('Recording')
    expect(button(container, 'Check').disabled).toBe(true)
    await click(stop)
    expect(stopTrack).toHaveBeenCalledTimes(1)
    expect(vi.mocked(transcribeAnswer)).toHaveBeenCalledTimes(1)
    const upload = vi.mocked(transcribeAnswer).mock.calls[0][0]!.data as FormData
    expect(upload.get('sessionId')).toBe('s1')
    expect(upload.get('itemId')).toBe('i1')
    const bytes = await (upload.get('audio') as File).arrayBuffer()
    expect(new DataView(bytes).getUint32(24, true)).toBe(24_000)
    expect(new DataView(bytes).getInt16(44, true)).toBe(8192)
    const input = container.querySelector<HTMLTextAreaElement>('textarea#answer')!
    expect(input.value).toBe('one')
    expect(input.disabled).toBe(false)
    expect(button(container, 'Record again')).toBeDefined()
    expect(answerItem).not.toHaveBeenCalled()
    await act(async () => {
      type(input, 'one more step')
      container.querySelector<HTMLInputElement>('input[value="sure"]')!.click()
    })
    await click(button(container, 'Check'))
    expect(answerItem).toHaveBeenCalledWith({ data: expect.objectContaining({ answer: { text: 'one more step' }, confidence: 'sure' }) })
    expect(document.querySelector('[role="dialog"] h2')!.textContent).toBe('Correct')
  } finally { await cleanup() }
})

it.each([
  { planner: 'muse-wonder-1.0', ok: true },
  { planner: 'planned by rules', ok: false },
] as const)('opens the model trace with $planner and its per-step reasons', async ({ planner, ok }) => {
  vi.mocked(getModelTrace).mockReset().mockResolvedValue({
    planning: { planner, steps: [{ reason: 'Review variables before they fade.' }] },
    totalCostUsd: 0,
    calls: [{ id: 'plan1', purpose: 'plan', model: 'muse-wonder-1.0', latencyMs: 120, ok, promptTokens: 10, completionTokens: 20, reasoningTokens: 0, costUsd: 0, createdAt: 1 }],
  })
  const { container, initial, cleanup } = await renderPlay(false)
  try {
    expect(button(container, 'Model trace')).toBeUndefined()
    await act(async () => {
      const input = container.querySelector<HTMLInputElement>('#answer')!
      type(input, '1')
      container.querySelector<HTMLInputElement>('input[value="sure"]')!.click()
    })
    await act(async () => { button(container, 'Check').click() })
    // The result sheet is modal, so the trace is reached on the screen after Continue.
    vi.mocked(nextItem).mockResolvedValueOnce({ ...initial, item: null })
    await act(async () => { button(container, 'Continue').click() })
    await act(async () => button(container, 'Model trace').click())
    expect(getModelTrace).toHaveBeenCalledWith({ data: { scope: 'session', sessionId: 's1' } })
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain(planner)
    expect(dialog.textContent).toContain('muse-wonder-1.0')
    expect(dialog.textContent).toContain('plan')
    expect(dialog.textContent).toContain('Review variables before they fade.')
    expect(dialog.textContent).toContain(ok ? 'Succeeded' : 'Failed')
  } finally { await cleanup() }
})

it('keeps typed input after a transcription failure', async () => {
  const { container, cleanup } = await renderPlay(true, false, 'short')
  try {
    await click(button(container, 'Type instead'))
    const input = container.querySelector<HTMLTextAreaElement>('textarea#answer')!
    expect(document.activeElement).toBe(input)
    await act(async () => type(input, 'my draft'))
    vi.mocked(transcribeAnswer).mockRejectedValueOnce(new Error('Voice transcription failed. Please try again.'))
    await click(button(container, 'Record again'))
    await click(byLabel(container, 'Stop recording'))
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Voice transcription failed. Please try again.')
    expect(container.querySelector<HTMLTextAreaElement>('textarea#answer')!.value).toBe('my draft')
    expect(container.querySelector<HTMLTextAreaElement>('textarea#answer')!.disabled).toBe(false)
  } finally { await cleanup() }
})

it('stops a microphone granted after the learner stops recording', async () => {
  const { container, mic, cleanup } = await renderPlay(true, true, 'short')
  try {
    await click(byLabel(container, 'Record answer'))
    await click(byLabel(container, 'Stop recording'))
    await act(async () => finishPermission!(mic))
    expect(stopTrack).toHaveBeenCalledTimes(1)
    expect(transcribeAnswer).not.toHaveBeenCalled()
    expect(byLabel(container, 'Record answer')).not.toBeNull()
    expect(byLabel(container, 'Stop recording')).toBeNull()
  } finally { await cleanup() }
})

it('discards a canceled permission request while a new recording is pending', async () => {
  const { container, mic, cleanup } = await renderPlay(true, true, 'short')
  try {
    await click(byLabel(container, 'Record answer'))
    const firstPermission = finishPermission!
    await click(byLabel(container, 'Stop recording'))
    await click(byLabel(container, 'Record answer'))
    const secondPermission = finishPermission!
    await act(async () => firstPermission(mic))
    expect(stopTrack).toHaveBeenCalledTimes(1)
    expect(byLabel(container, 'Stop recording')).not.toBeNull()
    expect(button(container, 'Check').disabled).toBe(true)
    await act(async () => secondPermission(mic))
    expect(byLabel(container, 'Stop recording')!.getAttribute('aria-pressed')).toBe('true')
    expect(transcribeAnswer).not.toHaveBeenCalled()
  } finally { await cleanup() }
})

it('keeps typing available when microphone permission is denied', async () => {
  const { container, cleanup } = await renderPlay(true, false, 'short')
  try {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
    await click(byLabel(container, 'Record answer'))
    expect(container.querySelector('[role="alert"]')!.textContent).toBe('Microphone access was denied. Allow it in your browser settings or type your answer.')
    await click(button(container, 'Type instead'))
    await act(async () => {
      type(container.querySelector('textarea#answer')!, 'typed instead')
      container.querySelector<HTMLInputElement>('input[value="sure"]')!.click()
    })
    await click(button(container, 'Check'))
    expect(answerItem).toHaveBeenCalledWith({ data: expect.objectContaining({ answer: { text: 'typed instead' }, confidence: 'sure' }) })
    expect(transcribeAnswer).not.toHaveBeenCalled()
  } finally { await cleanup() }
})

it('focuses the blank again after a restored page or an in-place resync, but leaves Try again focused', async () => {
  const { container, initial, cleanup } = await renderPlay(false)
  try {
    const blank = () => container.querySelector<HTMLInputElement>('input#answer')!
    expect(document.activeElement).toBe(blank())
    // A page restored from the browser cache locks the controls (browsers blur the disabled blank) and reloads the session.
    let loaded!: (view: SessionView) => void
    vi.mocked(getSession).mockReturnValue(new Promise<SessionView>((resolve) => { loaded = resolve }))
    await act(async () => { window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true })) })
    blank().blur()
    await act(async () => { loaded(initial) })
    expect(document.activeElement).toBe(blank())
    // The server already has an answer for this one (409): the next question replaces it in place.
    vi.mocked(answerItem).mockRejectedValueOnce(Object.assign(new Error('Already answered. Continue to the next question.'), { status: 409 }))
    vi.mocked(getSession).mockResolvedValue({ ...initial, progress: { position: 2, total: 2 }, item: { ...initial.item!, id: 'i2', stem: 'y - 1 = 2; y = ____' } })
    await act(async () => type(blank(), '1'))
    await pick(container, 'confidence', 'sure')
    await click(button(container, 'Check'))
    expect(container.querySelector('label[for="answer"]')!.textContent).toBe('y - 1 = 2; y = ')
    expect(document.activeElement).toBe(blank())
    // A failed check hands focus to Try again; the blank does not take it back.
    vi.mocked(answerItem).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await act(async () => type(blank(), '3'))
    await pick(container, 'confidence', 'sure')
    await click(button(container, 'Check'))
    expect(document.activeElement).toBe(button(container, 'Try again'))
  } finally { await cleanup() }
})

it('drops non-digits from a numeric blank, ignores a fourth digit, and sends "007" as typed', async () => {
  const { container, cleanup } = await renderPlay(false)
  try {
    const input = container.querySelector<HTMLInputElement>('input#answer')!
    expect(input.getAttribute('aria-label')).toBe('Missing number')
    expect(input.inputMode).toBe('numeric')
    expect(byLabel(container, 'Record answer')).toBeNull()
    await act(async () => type(input, 'a1b'))
    expect(input.value).toBe('1')
    // A stray character that filters back to the current value is still removed from the field.
    await act(async () => type(input, '1 '))
    expect(input.value).toBe('1')
    await act(async () => type(input, '1a'))
    expect(input.value).toBe('1')
    await act(async () => type(input, '0071'))
    expect(input.value).toBe('007')
    await act(async () => container.querySelector<HTMLInputElement>('input[value="sure"]')!.click())
    await click(button(container, 'Check'))
    expect(answerItem).toHaveBeenCalledWith({ data: expect.objectContaining({ answer: { text: '007' }, confidence: 'sure' }) })
  } finally { await cleanup() }
})

it.each([false, null])('offers typing when voice availability is %s', async (voiceEnabled) => {
  const { container, cleanup } = await renderPlay(voiceEnabled, false, 'short')
  try {
    const input = container.querySelector<HTMLTextAreaElement>('textarea#answer')!
    expect(input.disabled).toBe(false)
    expect(input.getAttribute('rows')).toBe('4')
    expect(container.querySelector('label[for="answer"]')!.textContent).toBe('Your answer')
    expect(byLabel(container, 'Record answer')).toBeNull()
    await act(async () => {
      type(input, '1')
      container.querySelector<HTMLInputElement>('input[value="sure"]')!.click()
    })
    await click(button(container, 'Check'))
    expect(answerItem).toHaveBeenCalledWith({ data: expect.objectContaining({ answer: { text: '1' }, confidence: 'sure' }) })
    expect(document.querySelector('[role="dialog"] h2')!.textContent).toBe('Correct')
  } finally { await cleanup() }
})

it.each([false, true])('submits a short answer and shows its reveal (ungraded=%s)', async (ungraded) => {
  const { container, initial, cleanup } = await renderPlay(false, false, 'short')
  try {
    vi.mocked(answerItem).mockResolvedValueOnce({
      attemptId: ungraded ? null : 'a1', diagramConceptId: 'c1', state: ungraded ? 'ungraded' : 'D', correct: false,
      xp: 0, critical: false, correctOptionIds: null, sourceVersion: null, detail: null,
      score: ungraded ? null : 0.5, feedback: ungraded ? 'Daily grading limit reached; back tomorrow. Compare your answer with the model answer. Your learning progress has not changed.' : 'Explain why both sides stay equal.',
      missingPoints: ungraded ? [] : ['Subtract the same amount from both sides.'],
      correctAnswer: 'Equal changes preserve equality.', explanation: 'Both sides change by the same amount.',
      chosenFeedback: null, sourceQuote: 'Subtract equal quantities.', sourceTitle: 'Algebra notes', mixUps: [], returnsThisSession: false, pKnownBefore: 0.6, pKnownAfter: 0.6,
    })
    const input = container.querySelector<HTMLInputElement>('#answer')!
    await act(async () => {
      type(input, 'Both sides get smaller.')
      container.querySelector<HTMLInputElement>('input[value="sure"]')!.click()
    })
    await act(async () => { button(container, 'Check').click() })
    expect(answerItem).toHaveBeenCalledWith({ data: expect.objectContaining({ answer: { text: 'Both sides get smaller.' } }) })
    const dialog = document.querySelector('[role="dialog"]')!
    if (ungraded) {
      expect(dialog.querySelector('h2')?.textContent).toBe('Couldn’t grade this answer')
      expect(dialog.textContent).toMatch(/Your answerBoth sides get smaller\.The answerEqual changes preserve equality\./)
      expect(dialog.textContent).toContain('Subtract equal quantities.')
      expect(dialog.textContent).toContain('Daily grading limit reached; back tomorrow. Compare your answer with the model answer. Your learning progress has not changed.')
      expect(dialog.querySelector('input')).toBeNull()
    } else {
      expect(dialog.querySelector('h2')?.textContent).toBe('Not quite')
      expect(dialog.textContent).toContain('Subtract equal quantities.')
      expect(dialog.textContent).toContain('Explain why both sides stay equal.')
      expect(dialog.textContent).toContain('Subtract the same amount from both sides.')
    }
    vi.mocked(nextItem).mockResolvedValueOnce({ ...initial, item: { ...initial.item!, id: 'i2', stem: 'Next question' } })
    await act(async () => { button(container, ungraded ? 'Continue' : 'Got it').click() })
    expect(nextItem).toHaveBeenCalledWith({ data: { sessionId: 's1', why: undefined } })
    expect(container.textContent).toContain('Next question')
  } finally { await cleanup() }
})

it('shows the current question, with controls disabled until it loads, after Back then Forward', async () => {
  const { container, initial, router, cleanup } = await renderPlay(false, false, 'short', true)
  try {
    expect(container.textContent).toContain('Explain why subtracting one preserves equality.')
    await act(async () => { router.history.back() })
    expect(container.textContent).toContain('Today page')
    let loaded!: (view: SessionView) => void
    vi.mocked(getSession).mockReturnValue(new Promise<SessionView>((resolve) => { loaded = resolve }))
    await act(async () => { router.history.forward() })
    // Nothing may offer the first-visit question as answerable while the current one is loading.
    const stale = container.querySelector<HTMLInputElement>('#answer')
    expect(stale === null || locked(stale)).toBe(true)
    expect(container.textContent).not.toContain('Explain why subtracting one preserves equality.')
    await act(async () => { loaded({ ...initial, progress: { position: 4, total: 4 }, item: { ...initial.item!, id: 'i4', stem: 'Fourth question' } }) })
    expect(container.querySelector('h1')!.textContent).toBe('Fourth question')
    expect(locked(container.querySelector<HTMLInputElement>('#answer')!)).toBe(false)
  } finally { await cleanup() }
})

it('disables the answer controls while a page restored from the browser cache reloads the session', async () => {
  const { container, initial, cleanup } = await renderPlay(false, false, 'short')
  try {
    const input = () => container.querySelector<HTMLInputElement>('#answer')!
    expect(locked(input())).toBe(false)
    let loaded!: (view: SessionView) => void
    vi.mocked(getSession).mockReturnValue(new Promise<SessionView>((resolve) => { loaded = resolve }))
    const restore = Object.assign(new Event('pageshow'), { persisted: true })
    await act(async () => { window.dispatchEvent(restore) })
    expect(getSession).toHaveBeenLastCalledWith({ data: { sessionId: 's1' } })
    expect(locked(input())).toBe(true)
    expect(button(container, 'Check').disabled).toBe(true)
    await act(async () => { loaded({ ...initial, progress: { position: 3, total: 3 }, item: { ...initial.item!, id: 'i3', stem: 'Third question' } }) })
    expect(container.querySelector('h1')!.textContent).toBe('Third question')
    expect(locked(input())).toBe(false)
  } finally { await cleanup() }
})

it('keeps the record button disabled when a restored page fails to reload the session', async () => {
  const { container, cleanup } = await renderPlay(true, false, 'short')
  try {
    vi.mocked(getSession).mockRejectedValueOnce(new Error('Network down'))
    await act(async () => { window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true })) })
    expect(container.textContent).toContain('Network down')
    const record = byLabel(container, 'Record answer')!
    expect(record.disabled).toBe(true)
    await act(async () => {
      record.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      record.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
    expect(byLabel(container, 'Stop recording')).toBeNull()
  } finally { await cleanup() }
})

const pick = (container: HTMLElement, name: string, value: string) => act(async () => { container.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)!.click() })
const checked = (container: HTMLElement, name: string) => container.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value

it('sends a multiple-choice answer only once an option and a confidence are chosen', async () => {
  const { container, cleanup } = await renderPlay(false, false, 'mcq')
  try {
    const bar = container.querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-valuenow')).toBe('1')
    expect(bar.getAttribute('aria-valuetext')).toBe('1 of 1')
    expect(button(container, 'Check').disabled).toBe(true)
    await pick(container, 'answer', 'b')
    expect(button(container, 'Check').disabled).toBe(true)
    await pick(container, 'confidence', 'guess')
    expect(button(container, 'Check').disabled).toBe(false)
    await act(async () => { button(container, 'Check').click() })
    expect(answerItem).toHaveBeenCalledTimes(1)
    expect(answerItem).toHaveBeenCalledWith({ data: { sessionId: 's1', itemId: 'i1', answer: { optionId: 'b' }, confidence: 'guess', responseMs: expect.any(Number) } })
    const { responseMs } = vi.mocked(answerItem).mock.calls[0][0]!.data as { responseMs: number }
    expect(Number.isInteger(responseMs) && responseMs >= 0).toBe(true)
  } finally { await cleanup() }
})

it('shows the server current question instead of replaying an answer that already landed (409)', async () => {
  const { container, initial, cleanup } = await renderPlay(false, false, 'mcq')
  try {
    vi.mocked(answerItem).mockRejectedValueOnce(Object.assign(new Error('Already answered. Continue to the next question.'), { status: 409 }))
    vi.mocked(getSession).mockResolvedValue({ ...initial, progress: { position: 2, total: 2 }, item: { ...initial.item!, id: 'i2', stem: 'Second question' } })
    await pick(container, 'answer', 'b')
    await pick(container, 'confidence', 'sure')
    await act(async () => { button(container, 'Check').click() })
    expect(container.querySelector('h1')!.textContent).toBe('Second question')
    expect(answerItem).toHaveBeenCalledTimes(1)
  } finally { await cleanup() }
})

it('ends the session from the top bar and returns to Today', async () => {
  const { container, cleanup } = await renderPlay(false)
  try {
    vi.mocked(endSession).mockReset().mockResolvedValue({} as never)
    await act(async () => { container.querySelector<HTMLButtonElement>('button[aria-label="End session"]')!.click() })
    expect(endSession).toHaveBeenCalledWith({ data: { sessionId: 's1' } })
    expect(container.textContent).toContain('Today page')
  } finally { await cleanup() }
})

it.each([
  new TypeError('Failed to fetch'),
  Object.assign(new Error('Internal error'), { status: 503 }),
])('keeps the answer and offers Try again when checking fails (%s)', async (failure) => {
  const { container, cleanup } = await renderPlay(false, false, 'mcq')
  try {
    vi.mocked(answerItem).mockRejectedValueOnce(failure).mockRejectedValueOnce(failure)
    await pick(container, 'answer', 'b')
    await pick(container, 'confidence', 'sure')
    await act(async () => { button(container, 'Check').click() })
    expect(container.querySelector('[role="alert"]')!.textContent).toBe('Couldn’t check your answer. It’s saved on this device.')
    expect(document.activeElement).toBe(button(container, 'Try again'))
    // The alert shares the sticky dock with Try again, so a long question cannot push it below the fold.
    expect(button(container, 'Try again').parentElement!.contains(container.querySelector('[role="alert"]'))).toBe(true)
    expect(button(container, 'Check')).toBeUndefined()
    expect(checked(container, 'answer')).toBe('b')
    expect(checked(container, 'confidence')).toBe('sure')
    // Changing the answer brings Check back; failing again offers Try again once more.
    await pick(container, 'answer', 'a')
    expect(button(container, 'Try again')).toBeUndefined()
    expect(button(container, 'Check').disabled).toBe(false)
    await act(async () => { button(container, 'Check').click() })
    expect(answerItem).toHaveBeenCalledTimes(2)
    await act(async () => { button(container, 'Try again').click() })
    expect(answerItem).toHaveBeenCalledTimes(3)
    expect(answerItem).toHaveBeenLastCalledWith({ data: expect.objectContaining({ answer: { optionId: 'a' }, confidence: 'sure' }) })
    expect(document.querySelector('[role="dialog"] h2')!.textContent).toBe('Correct')
  } finally { await cleanup() }
})

it.each([
  { format: 'diagram' },
])('tells the learner a $format question needs a newer app and lets them end the session', async ({ format }) => {
  const { container, cleanup } = await renderPlay(false, false, 'mcq', false, { format: format as ItemView['format'], options: [] })
  try {
    const main = container.querySelector('form#play')!
    expect(main.textContent).toContain('This question needs a newer version of the app.')
    expect([...main.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'End session')).toBe(true)
    expect(button(container, 'Check')).toBeUndefined()
    vi.mocked(endSession).mockReset().mockResolvedValue({} as never)
    await act(async () => { button(container, 'End session').click() })
    expect(endSession).toHaveBeenCalledWith({ data: { sessionId: 's1' } })
  } finally { await cleanup() }
})

it('locks the answer and confidence while a check is in flight, so Try again sends what is shown', async () => {
  const { container, cleanup } = await renderPlay(false, false, 'mcq')
  try {
    let fail!: (err: unknown) => void
    vi.mocked(answerItem).mockReturnValueOnce(new Promise((_, reject) => { fail = reject }))
    await pick(container, 'answer', 'b')
    await pick(container, 'confidence', 'sure')
    await act(async () => { button(container, 'Check').click() })
    const optionA = container.querySelector<HTMLInputElement>('input[name="answer"][value="a"]')!
    const unsure = container.querySelector<HTMLInputElement>('input[name="confidence"][value="unsure"]')!
    expect(locked(optionA)).toBe(true)
    expect(locked(unsure)).toBe(true)
    await act(async () => { fail(new TypeError('Failed to fetch')) })
    expect(locked(optionA)).toBe(false)
    await act(async () => { button(container, 'Try again').click() })
    expect(answerItem).toHaveBeenLastCalledWith({ data: expect.objectContaining({ answer: { optionId: 'b' }, confidence: 'sure' }) })
  } finally { await cleanup() }
})

describe('reveal overlay', () => {
  const sureWrong = {
    attemptId: 'a1', diagramConceptId: null, state: 'D', correct: false, xp: 0, critical: false, correctOptionIds: ['a'], sourceVersion: null, detail: null,
    score: 0, feedback: null, missingPoints: [], correctAnswer: '2', explanation: 'Add, then compare.', chosenFeedback: null,
    sourceQuote: null, sourceTitle: null, mixUps: [], returnsThisSession: false, pKnownBefore: 0.5, pKnownAfter: 0.3,
  } as unknown as Reveal
  const sureCorrect = { ...sureWrong, state: 'A', correct: true, xp: 10, sourceQuote: 'Quote', sourceTitle: 'Notes' } as unknown as Reveal

  async function check(reveal: Reveal, basics = false) {
    const view = await renderPlay(false, false, 'mcq', false, {}, basics)
    vi.mocked(answerItem).mockResolvedValueOnce(reveal)
    await act(async () => {
      view.container.querySelector<HTMLInputElement>('input[name="answer"]')!.click()
      view.container.querySelector<HTMLInputElement>('input[value="sure"]')!.click()
    })
    await act(async () => { button(view.container, 'Check').click() })
    return view
  }
  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
  const linkByText = (text: string) => [...document.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.trim() === text)!

  it('opens a dialog over the answered question and focuses the result heading', async () => {
    const { container, cleanup } = await check(sureWrong)
    try {
      const heading = dialog()!.querySelector('h2')!
      expect(dialog()!.getAttribute('aria-labelledby')).toBe(heading.id)
      expect(document.activeElement).toBe(heading)
      expect(container.textContent).toContain('x + 1 = 2; what is x?')
    } finally { await cleanup() }
  })

  it('keeps the reflection when Report is opened and cancelled, and returns focus to the Report link', async () => {
    const { cleanup } = await check(sureWrong)
    try {
      await act(async () => { type(dialog()!.querySelector('input')!, 'Because it matters') })
      await click(linkByText('Report this question'))
      expect(dialog()!.textContent).toContain('Send report')
      await click(document.querySelector<HTMLElement>('button[aria-label="Back to result"]'))
      expect(dialog()!.querySelector('input')!.value).toBe('Because it matters')
      expect(document.activeElement).toBe(linkByText('Report this question'))
    } finally { await cleanup() }
  })

  it('keeps the Why disclosure open across Report and Back', async () => {
    const { cleanup } = await check(sureCorrect)
    try {
      await click(linkByText('Why'))
      expect(linkByText('Why').getAttribute('aria-expanded')).toBe('true')
      await click(linkByText('Report this question'))
      await click(document.querySelector<HTMLElement>('button[aria-label="Back to result"]'))
      expect(linkByText('Why').getAttribute('aria-expanded')).toBe('true')
      expect(document.activeElement).toBe(linkByText('Report this question'))
    } finally { await cleanup() }
  })

  it('opens the Why disclosure immediately for a back-to-basics session', async () => {
    const { cleanup } = await check(sureCorrect, true)
    try {
      expect(linkByText('Why').getAttribute('aria-expanded')).toBe('true')
      expect(dialog()!.textContent).toContain('Add, then compare.')
    } finally { await cleanup() }
  })

  it('sends the report, then continues with the reflection, and announces it on the next question', async () => {
    const { container, initial, cleanup } = await check(sureWrong)
    try {
      vi.mocked(reportItem).mockReset().mockResolvedValue({} as never)
      vi.mocked(nextItem).mockResolvedValueOnce({ ...initial, progress: { position: 2, total: 2 }, item: { ...initial.item!, id: 'i2', stem: 'Second question' } })
      await act(async () => { type(dialog()!.querySelector('input')!, '  Because it matters  ') })
      await click(linkByText('Report this question'))
      await click(document.querySelector<HTMLElement>('[role="radiogroup"] [role="radio"]'))
      await click(linkByText('Send report'))
      expect(reportItem).toHaveBeenCalledWith({ data: expect.objectContaining({ itemId: 'i1', reason: expect.any(String), attemptId: 'a1' }) })
      expect(nextItem).toHaveBeenCalledWith({ data: { sessionId: 's1', why: 'Because it matters' } })
      expect(vi.mocked(reportItem).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(nextItem).mock.invocationCallOrder[0])
      expect(dialog()).toBeNull()
      expect(container.querySelector('h1')!.textContent).toBe('Second question')
      expect([...document.querySelectorAll('[role="status"]')].map((n) => n.textContent)).toContain('Report sent')
    } finally { await cleanup() }
  })

  it('returns to the result when continuing after a sent report fails, so Got it retries without reporting again', async () => {
    const { cleanup } = await check(sureWrong)
    try {
      vi.mocked(reportItem).mockReset().mockResolvedValue({} as never)
      vi.mocked(nextItem).mockRejectedValueOnce(new Error('Network down'))
      await act(async () => { type(dialog()!.querySelector('input')!, 'Because it matters') })
      await click(linkByText('Report this question'))
      await click(document.querySelector<HTMLElement>('[role="radiogroup"] [role="radio"]'))
      await click(linkByText('Send report'))
      expect(dialog()!.querySelector('[role="alert"]')).not.toBeNull()
      expect(linkByText('Report this question')).toBeUndefined()
      await click(linkByText('Got it'))
      expect(reportItem).toHaveBeenCalledTimes(1)
      expect(nextItem).toHaveBeenLastCalledWith({ data: { sessionId: 's1', why: 'Because it matters' } })
    } finally { await cleanup() }
  })

  it('ignores scrim clicks and Escape', async () => {
    const { cleanup } = await check(sureWrong)
    try {
      await act(async () => { document.querySelector('.bg-scrim')!.dispatchEvent(new Event('pointerdown', { bubbles: true })) })
      await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
      expect(dialog()).not.toBeNull()
      expect(nextItem).not.toHaveBeenCalled()
    } finally { await cleanup() }
  })

  it('does not reload the session when the page is restored from the cache while the result shows', async () => {
    const { cleanup } = await check(sureWrong)
    try {
      vi.mocked(getSession).mockClear()
      await act(async () => { window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true })) })
      expect(getSession).not.toHaveBeenCalled()
      expect(dialog()).not.toBeNull()
    } finally { await cleanup() }
  })
})
