import type { SessionView } from '@learnquiz/api'
import { MAX_VOICE_SECONDS } from '@learnquiz/api/voice'
import { chunkLevel, chunkSeconds, isCanonicalVoiceWav, wavFromChunks, type PcmChunk } from './wav'

// The voice answer for a short-answer question: record, upload, transcript,
// then an editable answer. Pure: the microphone, the network, announcements
// and focus are ports, so the screen only renders what this returns.

export const MAX_ANSWER_LENGTH = 1000
export const LEVEL_INTERVAL_MS = 100 // at most 10 level updates a second

export const voiceCopy = {
  idle: 'Tap to record',
  recording: 'Tap to stop',
  transcribing: 'Turning your recording into text…',
  announceRecording: 'Recording',
  denied: 'Microphone access was denied. Allow it in settings or type your answer.',
  failed: 'Recording failed. Please try again or type your answer.',
} as const

export type VoiceStep = 'idle' | 'requesting' | 'recording' | 'transcribing' | 'review'
export type VoiceAlert = null | { kind: 'denied'; settings: boolean } | { kind: 'failed'; retry: boolean }
export type VoiceState = {
  step: VoiceStep
  alert: VoiceAlert
  level: number // 0..1, for the five-bar meter
  available: boolean // false: typed answer only, no mic
}

export type VoicePermission = { granted: boolean; canAskAgain: boolean }

export type VoicePorts = {
  permission(): Promise<VoicePermission>
  start(): Promise<void> // starts the microphone stream
  stop(): void // stops the stream and releases the microphone
  upload(wav: Uint8Array, signal: AbortSignal): Promise<unknown> // resolves to the transcript
  announce(message: string): void
  focus(target: 'stop' | 'field' | 'type'): void
  now(): number
}

export type VoiceAnswer = {
  text(): string // the current typed answer
  setText(text: string | undefined): void // undefined clears the answer
}

// Voice is offered only when the server says so. It is false for role topics
// (no model calls while an employee plays one), and missing means off.
export function voiceSessionId(view: Pick<SessionView, 'id' | 'voiceEnabled'> | null | undefined): string | null {
  return view?.voiceEnabled === true ? view.id : null
}

// A server refusal of voice (404) is the same gate as voiceEnabled false: the
// question drops to typing and is never retried. Network and server errors can
// be retried with the same recording; other refusals need a new recording.
export function uploadFailure(error: unknown): 'unavailable' | 'retry' | 'record' {
  const status = error && typeof error === 'object' && 'status' in error ? (error as { status: unknown }).status : null
  if (status === 404) return 'unavailable'
  if (status === null || status === undefined || status === 408 || status === 429 || (typeof status === 'number' && status >= 500)) return 'retry'
  return 'record'
}

const BAR_SHAPE = [0.25, 0.625, 1, 0.5, 0.75] as const // the static meter from the design, 8/20/32/16/24 of 32
export function levelBars(level: number, reducedMotion: boolean, height = 32): number[] {
  const min = height / 8
  if (reducedMotion) return BAR_SHAPE.map((shape) => Math.round(shape * height))
  const scaled = Math.min(1, Math.sqrt(Math.max(0, level)) * 2)
  return BAR_SHAPE.map((shape) => Math.round(Math.max(min, shape * height * scaled)))
}

export function initialVoiceState(text: string, available: boolean): VoiceState {
  return { step: text.trim() ? 'review' : 'idle', alert: null, level: 0, available }
}

export class VoiceAnswerController {
  private state: VoiceState
  private listeners = new Set<() => void>()
  private chunks: PcmChunk[] = []
  private seconds = 0
  private stashed = ''
  private pending: Uint8Array | null = null
  private request: AbortController | null = null
  private run = 0 // bumps on every discard so late async results are dropped
  private starting: number | null = null // the run of a microphone start still in flight
  private lastLevelAt = -Infinity
  private disabled = false

  constructor(private ports: VoicePorts, private answer: VoiceAnswer, available: boolean) {
    this.state = initialVoiceState(answer.text(), available)
  }

  getState = (): VoiceState => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  setDisabled(disabled: boolean) {
    this.disabled = disabled
  }

  // The one mic button: start from idle or review, stop while recording.
  // Stopping is never blocked, even while the screen is busy.
  tap() {
    if (this.state.step === 'recording') return this.finish()
    if (this.disabled || !this.state.available) return
    // A cancelled start that has not settled yet still owns the stream; wait for it.
    if (this.starting !== null) return
    if (this.state.step === 'idle' || this.state.step === 'review') void this.start()
  }

  typeInstead() {
    if (this.disabled || this.busy()) return
    this.set({ step: 'review', alert: null })
    this.ports.focus('type')
  }

  retry() {
    if (this.disabled || this.busy() || !this.pending || this.state.alert?.kind !== 'failed' || !this.state.alert.retry) return
    if (this.stashed) this.answer.setText(undefined)
    void this.upload(this.pending)
  }

  buffer(chunk: PcmChunk) {
    if (this.state.step !== 'recording') return
    const room = MAX_VOICE_SECONDS - this.seconds
    const seconds = chunkSeconds(chunk)
    if (seconds > room) {
      const channels = Math.max(1, Math.floor(chunk.channels))
      const keep = Math.max(0, Math.floor(room * chunk.sampleRate)) * channels * 2
      chunk = { ...chunk, data: chunk.data.slice(0, keep) }
    }
    this.chunks.push({ ...chunk, data: chunk.data.slice(0) })
    this.seconds += Math.min(seconds, room)
    const now = this.ports.now()
    if (now - this.lastLevelAt >= LEVEL_INTERVAL_MS) {
      this.lastLevelAt = now
      this.set({ level: chunkLevel(chunk.data) })
    }
    if (this.seconds >= MAX_VOICE_SECONDS) this.finish()
  }

  // The stream reported an error while recording.
  streamError() {
    if (this.state.step !== 'recording') return
    this.ports.stop()
    this.fail(false)
  }

  // The app left the foreground. Android's permission dialog pauses the app
  // too, so a pending permission request is kept. A microphone start in flight,
  // a recording or a transcription is dropped.
  background(): boolean {
    return this.state.step === 'requesting' && this.starting === null ? false : this.discard()
  }

  // Background, End session or Back: drop the recording and free the microphone.
  // Returns whether there was anything to discard (the first Back is consumed).
  discard(): boolean {
    const step = this.state.step
    if (step !== 'requesting' && step !== 'recording' && step !== 'transcribing') return false
    this.run++
    if (step === 'recording') this.ports.stop()
    this.request?.abort()
    this.request = null
    this.chunks = []
    this.pending = null
    this.restore()
    this.set({ step: this.stashed.trim() ? 'review' : 'idle', alert: null, level: 0 })
    return true
  }

  dispose() {
    this.discard()
    this.listeners.clear()
  }

  private busy() {
    return this.state.step === 'requesting' || this.state.step === 'recording' || this.state.step === 'transcribing'
  }

  private async start() {
    const run = ++this.run
    this.stashed = this.answer.text()
    this.set({ step: 'requesting', alert: null, level: 0 })
    let permission: VoicePermission
    try {
      permission = await this.ports.permission()
    } catch {
      if (run === this.run) this.fail(false)
      return
    }
    if (run !== this.run) return
    if (!permission.granted) {
      this.set({ step: this.stashed.trim() ? 'review' : 'idle', alert: { kind: 'denied', settings: !permission.canAskAgain } })
      return
    }
    this.chunks = []
    this.seconds = 0
    this.pending = null
    this.lastLevelAt = -Infinity
    // The start is its own attempt: Background, Back or End session while it
    // is in flight bump the run, and a start that lands after that is stopped
    // at once instead of recording.
    this.starting = run
    try {
      await this.ports.start()
    } catch {
      if (run === this.run) this.fail(false)
      return
    } finally {
      this.starting = null
    }
    if (run !== this.run) {
      this.ports.stop()
      return
    }
    // The old text must not be checkable while a new answer is recorded.
    if (this.stashed) this.answer.setText(undefined)
    this.set({ step: 'recording' })
    this.ports.announce(voiceCopy.announceRecording)
    this.ports.focus('stop')
  }

  private finish() {
    this.ports.stop()
    const wav = wavFromChunks(this.chunks)
    this.chunks = []
    if (!wav || !isCanonicalVoiceWav(wav)) return this.fail(false)
    this.pending = wav
    void this.upload(wav)
  }

  private async upload(wav: Uint8Array) {
    const run = this.run
    const request = new AbortController()
    this.request = request
    this.set({ step: 'transcribing', alert: null, level: 0 })
    let transcript: unknown
    try {
      transcript = await this.ports.upload(wav, request.signal)
    } catch (error) {
      if (run !== this.run || request.signal.aborted) return
      this.request = null
      const failure = uploadFailure(error)
      if (failure === 'unavailable') {
        this.pending = null
        this.restore()
        this.set({ step: 'review', alert: null, available: false })
        this.ports.focus('type')
        return
      }
      return this.fail(failure === 'retry')
    }
    if (run !== this.run || request.signal.aborted) return
    this.request = null
    if (typeof transcript !== 'string' || !transcript.trim()) return this.fail(false)
    this.pending = null
    const text = transcript.trim().slice(0, MAX_ANSWER_LENGTH)
    this.answer.setText(text)
    this.set({ step: 'review', alert: null })
    this.ports.announce(text)
    this.ports.focus('field')
  }

  private fail(retry: boolean) {
    if (!retry) this.pending = null
    this.restore()
    this.set({ step: this.stashed.trim() ? 'review' : 'idle', alert: { kind: 'failed', retry }, level: 0 })
  }

  private restore() {
    if (this.stashed && this.answer.text() !== this.stashed) this.answer.setText(this.stashed)
  }

  private set(next: Partial<VoiceState>) {
    this.state = { ...this.state, ...next }
    for (const listener of this.listeners) listener()
  }
}
