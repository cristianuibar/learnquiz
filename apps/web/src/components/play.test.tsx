// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Route as playRoute } from '@/routes/play.$sessionId'
import { Route as appRootRoute } from '@/routes/__root'
import { answerItem, getSession, nextItem, transcribeAnswer } from '@/server/play'
import { getModelTrace } from '@/server/model-trace'
import { generateConceptDiagram } from '@/server/diagrams'
import type { Reveal, SessionView } from '@learnquiz/api'

vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('@/server/play', () => ({ answerItem: vi.fn(), getSession: vi.fn(), transcribeAnswer: vi.fn(), nextItem: vi.fn(), endSession: vi.fn(), reportItem: vi.fn() }))
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

async function renderPlay(voiceEnabled: boolean | null = true, permissionPending = false, format: 'cloze' | 'short' = 'cloze', fromToday = false) {
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
    item: { id: 'i1', conceptId: 'c1', conceptName: 'Variables', format, stem: format === 'short' ? 'Explain why subtracting one preserves equality.' : 'x + 1 = 2; x = ____', options: [], blank: format === 'cloze' ? { numeric: true } : null, image: null, difficulty: 1, generatedBy: 'gpt-test' },
  }
  vi.mocked(getSession).mockResolvedValue(initial)
  vi.mocked(transcribeAnswer).mockReset().mockResolvedValue('one')
  vi.mocked(answerItem).mockReset().mockResolvedValue({ correct: true, correctAnswer: '1', state: 'A', mixUps: [], explanation: 'Subtract one.', xp: 10, critical: false, correctOptionIds: null, sourceVersion: null, detail: null } as unknown as Reveal)
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
const locked = (el: HTMLElement) => (el as HTMLInputElement).disabled || Boolean(el.closest('fieldset')?.disabled)
const button = (container: HTMLElement, label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!
async function key(container: HTMLElement, type: 'keydown' | 'keyup') {
  await act(async () => button(container, type === 'keydown' ? 'Hold to answer by voice' : 'Release to transcribe')
    .dispatchEvent(new KeyboardEvent(type, { key: ' ', bubbles: true, cancelable: true })))
}

it('keeps an unsent answer and confidence across a reload and clears them after Check', async () => {
  const typeAndRate = async (container: HTMLElement) => act(async () => {
    const input = container.querySelector<HTMLInputElement>('#answer')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'one more')
    input.dispatchEvent(new Event('input', { bubbles: true }))
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
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, repeats ? '0' : '1')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      container.querySelector<HTMLInputElement>(`input[value="${repeats ? 'unsure' : 'sure'}"]`)!.click()
    })
    await act(async () => { button(container, 'Check').click() })
    if (repeats) {
      expect(container.querySelector('[role="status"]')!.textContent).toContain('No source: written by gpt-test from general knowledge')
      expect(container.querySelector('label[for="why"]')!.textContent).toBe('In one line, why? (optional)')
    }
    await act(async () => {
      const next = button(container, 'Continue')
      next.focus()
      next.click()
    })
    expect(nextItem).toHaveBeenCalledWith({ data: { sessionId: 's1', why: undefined } })
    expect(document.activeElement?.textContent).toBe(nextView.item!.stem)
    expect(document.activeElement?.tagName).toBe('H1')
    expect(button(container, 'Check').disabled).toBe(true)
  } finally { await cleanup() }
})

it('records, uploads WAV, lets the learner edit the transcript, and checks the edited answer', async () => {
  const { container, cleanup } = await renderPlay()
  try {
    expect(container.textContent).toContain('x + 1 = 2')
    await key(container, 'keydown')
    expect(button(container, 'Check').disabled).toBe(true)
    await key(container, 'keyup')
    expect(stopTrack).toHaveBeenCalledTimes(1)
    expect(vi.mocked(transcribeAnswer)).toHaveBeenCalledTimes(1)
    const upload = vi.mocked(transcribeAnswer).mock.calls[0][0]!.data as FormData
    expect(upload.get('sessionId')).toBe('s1')
    expect(upload.get('itemId')).toBe('i1')
    const bytes = await (upload.get('audio') as File).arrayBuffer()
    expect(new DataView(bytes).getUint32(24, true)).toBe(24_000)
    expect(new DataView(bytes).getInt16(44, true)).toBe(8192)
    const input = container.querySelector<HTMLInputElement>('#answer')!
    expect(input.value).toBe('one')
    expect(input.disabled).toBe(false)
    expect(answerItem).not.toHaveBeenCalled()
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '1')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      container.querySelector<HTMLInputElement>('input[value="sure"]')!.click()
    })
    await act(async () => { button(container, 'Check').click() })
    expect(answerItem).toHaveBeenCalledWith({ data: expect.objectContaining({ answer: { text: '1' }, confidence: 'sure' }) })
    expect(container.textContent).toContain('Correct, you were sure')
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
  const { container, cleanup } = await renderPlay(false)
  try {
    expect(container.textContent).toContain('x + 1 = 2')
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
  const { container, cleanup } = await renderPlay()
  try {
    const input = container.querySelector<HTMLInputElement>('#answer')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'my draft')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    vi.mocked(transcribeAnswer).mockRejectedValueOnce(new Error('Voice transcription failed. Please try again.'))
    await key(container, 'keydown'); await key(container, 'keyup')
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Voice transcription failed. Please try again.')
    expect(input.value).toBe('my draft')
    expect(input.disabled).toBe(false)
  } finally { await cleanup() }
})

it('stops a microphone granted after the learner releases the button', async () => {
  const { container, mic, cleanup } = await renderPlay(true, true)
  try {
    await key(container, 'keydown')
    await act(async () => button(container, 'Hold to answer by voice').dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true })))
    await act(async () => finishPermission!(mic))
    expect(stopTrack).toHaveBeenCalledTimes(1)
    expect(transcribeAnswer).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLInputElement>('#answer')!.disabled).toBe(false)
  } finally { await cleanup() }
})

it('discards a canceled permission request while a new recording is pending', async () => {
  const { container, mic, cleanup } = await renderPlay(true, true)
  try {
    await key(container, 'keydown')
    const firstPermission = finishPermission!
    await act(async () => button(container, 'Hold to answer by voice').dispatchEvent(new Event('pointercancel', { bubbles: true })))
    await key(container, 'keydown')
    const secondPermission = finishPermission!
    await act(async () => firstPermission(mic))
    expect(stopTrack).toHaveBeenCalledTimes(1)
    expect(container.querySelector<HTMLInputElement>('#answer')!.disabled).toBe(true)
    await act(async () => secondPermission(mic))
    expect(button(container, 'Release to transcribe')).toBeDefined()
    expect(transcribeAnswer).not.toHaveBeenCalled()
  } finally { await cleanup() }
})

it.each([false, null])('offers typing when voice availability is %s', async (voiceEnabled) => {
  const { container, cleanup } = await renderPlay(voiceEnabled)
  try {
    const input = container.querySelector<HTMLInputElement>('#answer')!
    expect(input.disabled).toBe(false)
    expect(button(container, 'Hold to answer by voice')).toBeUndefined()
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '1')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      container.querySelector<HTMLInputElement>('input[value="sure"]')!.click()
    })
    await act(async () => { button(container, 'Check').click() })
    expect(answerItem).toHaveBeenCalledWith({ data: expect.objectContaining({ answer: { text: '1' }, confidence: 'sure' }) })
    expect(container.textContent).toContain('Correct, you were sure')
  } finally { await cleanup() }
})

it.each([false, true])('submits a short answer and shows its reveal (ungraded=%s)', async (ungraded) => {
  const { container, initial, cleanup } = await renderPlay(false, false, 'short')
  try {
    vi.mocked(answerItem).mockResolvedValueOnce({
      attemptId: ungraded ? null : 'a1', diagramConceptId: 'c1', state: ungraded ? 'ungraded' : 'D', correct: false,
      xp: 0, critical: false, correctOptionIds: null, sourceVersion: null, detail: null,
      score: ungraded ? null : 0.5, feedback: ungraded ? 'Compare your answer with the model answer.' : 'Explain why both sides stay equal.',
      missingPoints: ungraded ? [] : ['Subtract the same amount from both sides.'],
      correctAnswer: 'Equal changes preserve equality.', explanation: 'Both sides change by the same amount.',
      chosenFeedback: null, sourceQuote: 'Subtract equal quantities.', sourceTitle: 'Algebra notes', mixUps: [], returnsThisSession: false, pKnownBefore: 0.6, pKnownAfter: 0.6,
    })
    const input = container.querySelector<HTMLInputElement>('#answer')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Both sides get smaller.')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      container.querySelector<HTMLInputElement>('input[value="sure"]')!.click()
    })
    await act(async () => { button(container, 'Check').click() })
    expect(answerItem).toHaveBeenCalledWith({ data: expect.objectContaining({ answer: { text: 'Both sides get smaller.' } }) })
    const status = container.querySelector('[role="status"]')!
    expect(status.querySelector('img')?.getAttribute('src')).toBe('/media/concepts/c1')
    if (ungraded) {
      expect(status.querySelector('h2')?.textContent).toBe('Could not grade this answer')
      expect(status.textContent).toMatch(/Your answerBoth sides get smaller\.The answer is Equal changes preserve equality\./)
      expect(status.textContent).toContain('Compare your answer with the model answer.')
      expect(status.querySelector('#why')).toBeNull()
    } else {
      expect(status.textContent).toContain('Score: 50%')
      expect(status.textContent).toContain('Subtract equal quantities.')
      expect(status.textContent).toContain('From Algebra notes')
      expect(status.textContent).toContain('Explain why both sides stay equal.')
      expect(status.textContent).toContain('Subtract the same amount from both sides.')
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
