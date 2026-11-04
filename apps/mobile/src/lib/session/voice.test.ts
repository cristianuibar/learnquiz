import { MAX_VOICE_SECONDS, VOICE_SAMPLE_RATE } from '@learnquiz/api/voice'
import { ApiError } from '../api'
import { isCanonicalVoiceWav } from './wav'
import { levelBars, uploadFailure, voiceCopy, voiceSessionId, VoiceAnswerController, type VoicePermission, type VoicePorts } from './voice'

jest.mock('../auth', () => ({ getToken: () => null, handleUnauthorized: async () => {} }))

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void }
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

function setup({ text = '', available = true, permission = { granted: true, canAskAgain: true } as VoicePermission } = {}) {
  let answer = text
  const uploads: Deferred<unknown>[] = []
  const signals: AbortSignal[] = []
  let clock = 0
  const ports = {
    permission: jest.fn(async () => permission),
    start: jest.fn(async () => {}),
    stop: jest.fn(),
    upload: jest.fn((wav: Uint8Array, signal: AbortSignal) => {
      signals.push(signal)
      const next = deferred<unknown>()
      uploads.push(next)
      return next.promise
    }),
    announce: jest.fn(),
    focus: jest.fn(),
    now: jest.fn(() => clock),
  } satisfies VoicePorts
  const setText = jest.fn((next: string | undefined) => { answer = next ?? '' })
  const voice = new VoiceAnswerController(ports, { text: () => answer, setText }, available)
  return {
    voice, ports, setText, uploads, signals,
    answer: () => answer,
    tick(ms: number) { clock += ms },
  }
}

const flush = () => new Promise((done) => setImmediate(done))
const speech = (seconds = 0.1, rate = VOICE_SAMPLE_RATE) => ({
  data: new Int16Array(Math.round(seconds * rate)).fill(4000).buffer,
  sampleRate: rate,
  channels: 1,
})

async function recording(t: ReturnType<typeof setup>) {
  t.voice.tap()
  await flush()
  expect(t.voice.getState().step).toBe('recording')
}

test('offers voice only when the session says so; role topics and old servers type only', () => {
  expect(voiceSessionId({ id: 's1', voiceEnabled: true })).toBe('s1')
  expect(voiceSessionId({ id: 's1', voiceEnabled: false })).toBeNull()
  expect(voiceSessionId({ id: 's1' })).toBeNull()
  expect(voiceSessionId(null)).toBeNull()
})

test('records, uploads a canonical WAV and lands the transcript in the field', async () => {
  const t = setup()
  expect(t.voice.getState()).toMatchObject({ step: 'idle', alert: null })
  await recording(t)
  expect(t.ports.permission).toHaveBeenCalledTimes(1)
  expect(t.ports.announce).toHaveBeenCalledWith(voiceCopy.announceRecording)
  expect(t.ports.focus).toHaveBeenLastCalledWith('stop')

  t.voice.buffer(speech(0.5))
  t.voice.tap()
  expect(t.ports.stop).toHaveBeenCalledTimes(1)
  expect(t.voice.getState().step).toBe('transcribing')
  const wav = t.ports.upload.mock.calls[0][0]
  expect(isCanonicalVoiceWav(wav)).toBe(true)
  expect(wav.byteLength).toBe(44 + VOICE_SAMPLE_RATE)

  t.uploads[0].resolve('  Hit the stop button  ')
  await flush()
  expect(t.answer()).toBe('Hit the stop button')
  expect(t.voice.getState()).toMatchObject({ step: 'review', alert: null })
  expect(t.ports.announce).toHaveBeenLastCalledWith('Hit the stop button')
  expect(t.ports.announce).toHaveBeenCalledTimes(2)
  expect(t.ports.focus).toHaveBeenLastCalledWith('field')
})

test('a denied microphone shows the alert and never starts the stream', async () => {
  const t = setup({ permission: { granted: false, canAskAgain: true } })
  t.voice.tap()
  await flush()
  expect(t.voice.getState()).toMatchObject({ step: 'idle', alert: { kind: 'denied', settings: false } })
  expect(t.ports.start).not.toHaveBeenCalled()
  t.voice.typeInstead()
  expect(t.voice.getState()).toMatchObject({ step: 'review', alert: null })
  expect(t.ports.focus).toHaveBeenLastCalledWith('type')
})

test('when Android will not ask again, the alert links to settings', async () => {
  const t = setup({ permission: { granted: false, canAskAgain: false } })
  t.voice.tap()
  await flush()
  expect(t.voice.getState().alert).toEqual({ kind: 'denied', settings: true })
})

test('permission is not asked until the first tap', () => {
  const t = setup()
  expect(t.ports.permission).not.toHaveBeenCalled()
})

test('a stream that fails to start reports a recording failure and keeps the typed answer', async () => {
  const t = setup({ text: 'Lock out the belt' })
  t.ports.start.mockRejectedValueOnce(new Error('mic busy'))
  t.voice.tap()
  await flush()
  expect(t.voice.getState()).toMatchObject({ step: 'review', alert: { kind: 'failed', retry: false } })
  expect(t.answer()).toBe('Lock out the belt')
  expect(t.ports.upload).not.toHaveBeenCalled()
})

test('a stream error mid-recording releases the microphone and fails', async () => {
  const t = setup()
  await recording(t)
  t.voice.streamError()
  expect(t.ports.stop).toHaveBeenCalledTimes(1)
  expect(t.voice.getState()).toMatchObject({ step: 'idle', alert: { kind: 'failed', retry: false } })
})

test('stopping with no audio fails without uploading', async () => {
  const t = setup()
  await recording(t)
  t.voice.tap()
  expect(t.ports.upload).not.toHaveBeenCalled()
  expect(t.voice.getState().alert).toEqual({ kind: 'failed', retry: false })
})

test('an upload network failure can be retried with the same recording', async () => {
  const t = setup()
  await recording(t)
  t.voice.buffer(speech())
  t.voice.tap()
  t.uploads[0].reject(new ApiError(null, 'Network request failed'))
  await flush()
  expect(t.voice.getState()).toMatchObject({ step: 'idle', alert: { kind: 'failed', retry: true } })

  t.voice.retry()
  expect(t.voice.getState().step).toBe('transcribing')
  expect(t.ports.upload).toHaveBeenCalledTimes(2)
  expect(t.ports.upload.mock.calls[1][0]).toBe(t.ports.upload.mock.calls[0][0])
  expect(t.ports.start).toHaveBeenCalledTimes(1)
  t.uploads[1].resolve('Second try')
  await flush()
  expect(t.answer()).toBe('Second try')
  expect(t.voice.getState()).toMatchObject({ step: 'review', alert: null })
})

test('a refused recording (400) asks for a new one instead of a retry', async () => {
  const t = setup()
  await recording(t)
  t.voice.buffer(speech())
  t.voice.tap()
  t.uploads[0].reject(new ApiError(400, 'Record an answer of up to one minute.'))
  await flush()
  expect(t.voice.getState().alert).toEqual({ kind: 'failed', retry: false })
  t.voice.retry()
  expect(t.ports.upload).toHaveBeenCalledTimes(1)
})

test('a server refusal of voice (role topic, 404) drops to typing for good', async () => {
  const t = setup({ text: 'Earlier answer' })
  await recording(t)
  expect(t.answer()).toBe('')
  t.voice.buffer(speech())
  t.voice.tap()
  t.uploads[0].reject(new ApiError(404, 'Voice answers are unavailable.'))
  await flush()
  expect(t.voice.getState()).toMatchObject({ step: 'review', alert: null, available: false })
  expect(t.answer()).toBe('Earlier answer')
  t.voice.tap()
  await flush()
  expect(t.ports.permission).toHaveBeenCalledTimes(1)
})

test('voice that is not available never touches the microphone', async () => {
  const t = setup({ available: false })
  t.voice.tap()
  await flush()
  expect(t.ports.permission).not.toHaveBeenCalled()
  expect(t.ports.start).not.toHaveBeenCalled()
})

test('a disabled question ignores taps', async () => {
  const t = setup({ text: 'Answer' })
  t.voice.setDisabled(true)
  t.voice.tap()
  t.voice.typeInstead()
  await flush()
  expect(t.ports.permission).not.toHaveBeenCalled()
  expect(t.voice.getState()).toMatchObject({ step: 'review', alert: null })
})

test('a draft with text resumes in review', () => {
  expect(setup({ text: 'Saved' }).voice.getState().step).toBe('review')
  expect(setup({ text: '   ' }).voice.getState().step).toBe('idle')
})

test('Record again hides the old text while recording and restores it on discard', async () => {
  const t = setup({ text: 'Old answer' })
  await recording(t)
  expect(t.setText).toHaveBeenLastCalledWith(undefined)
  expect(t.voice.discard()).toBe(true)
  expect(t.ports.stop).toHaveBeenCalledTimes(1)
  expect(t.answer()).toBe('Old answer')
  expect(t.voice.getState()).toMatchObject({ step: 'review', alert: null })
  expect(t.voice.discard()).toBe(false) // the second Back leaves
})

test('discarding while transcribing aborts the upload and ignores its result', async () => {
  const t = setup()
  await recording(t)
  t.voice.buffer(speech())
  t.voice.tap()
  expect(t.voice.discard()).toBe(true)
  expect(t.signals[0].aborted).toBe(true)
  t.uploads[0].resolve('Too late')
  await flush()
  expect(t.answer()).toBe('')
  expect(t.voice.getState()).toMatchObject({ step: 'idle', alert: null })
})

test('a permission answer that arrives after a discard does not start the microphone', async () => {
  const t = setup()
  const answer = deferred<VoicePermission>()
  t.ports.permission.mockReturnValueOnce(answer.promise)
  t.voice.tap()
  expect(t.voice.getState().step).toBe('requesting')
  t.voice.discard()
  answer.resolve({ granted: true, canAskAgain: true })
  await flush()
  expect(t.ports.start).not.toHaveBeenCalled()
  expect(t.voice.getState().step).toBe('idle')
})

test('recording stops by itself at the one-minute limit', async () => {
  const t = setup()
  await recording(t)
  for (let i = 0; i < MAX_VOICE_SECONDS - 1; i++) t.voice.buffer(speech(1))
  expect(t.ports.upload).not.toHaveBeenCalled()
  t.voice.buffer(speech(1.5))
  expect(t.ports.stop).toHaveBeenCalledTimes(1)
  const wav = t.ports.upload.mock.calls[0][0]
  expect(isCanonicalVoiceWav(wav)).toBe(true)
  expect(wav.byteLength).toBe(44 + VOICE_SAMPLE_RATE * 2 * MAX_VOICE_SECONDS)
  t.voice.buffer(speech(1))
  expect(t.ports.upload).toHaveBeenCalledTimes(1)
})

test('the level meter updates at most ten times a second', async () => {
  const t = setup()
  await recording(t)
  const listener = jest.fn()
  t.voice.subscribe(listener)
  t.voice.buffer(speech(0.02))
  t.tick(40)
  t.voice.buffer(speech(0.02))
  t.tick(60)
  t.voice.buffer(speech(0.02))
  expect(listener).toHaveBeenCalledTimes(2)
  expect(t.voice.getState().level).toBeGreaterThan(0)
})

test('reduced motion shows the static bars from the design', () => {
  expect(levelBars(0, true)).toEqual([8, 20, 32, 16, 24])
  expect(levelBars(1, true)).toEqual([8, 20, 32, 16, 24])
  expect(levelBars(0, false)).toEqual([4, 4, 4, 4, 4])
  expect(levelBars(1, false)).toEqual([8, 20, 32, 16, 24])
})

test('classifies upload failures', () => {
  expect(uploadFailure(new ApiError(404, 'Voice answers are unavailable.'))).toBe('unavailable')
  expect(uploadFailure(new ApiError(null, 'Network request failed'))).toBe('retry')
  expect(uploadFailure(new ApiError(503, 'x'))).toBe('retry')
  expect(uploadFailure(new ApiError(409, 'That is not the current question'))).toBe('record')
})

test('a blank or malformed transcript is a failure', async () => {
  for (const result of ['  ', { text: 'x' }]) {
    const t = setup()
    await recording(t)
    t.voice.buffer(speech())
    t.voice.tap()
    t.uploads[0].resolve(result)
    await flush()
    expect(t.voice.getState().alert).toEqual({ kind: 'failed', retry: false })
    expect(t.answer()).toBe('')
  }
})
