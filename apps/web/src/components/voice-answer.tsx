import { useEffect, useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { Mic } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ErrorRow } from '@/components/question/error-row'
import { errorMessage } from '@/components/inline-error'
import { MAX_VOICE_SECONDS, recordingToWav } from '@/lib/voice'
import { transcribeAnswer } from '@/server/play'

export function VoiceAnswer({ sessionId, itemId, voiceEnabled, text, onText, disabled, onBusyChange }: {
  sessionId: string
  itemId: string
  voiceEnabled: boolean
  text: string
  onText: (text: string) => void
  disabled: boolean
  onBusyChange: (busy: boolean) => void
}) {
  const transcribe = useServerFn(transcribeAnswer)
  const [step, setStep] = useState<'idle' | 'permission' | 'recording' | 'transcribing' | 'review'>(voiceEnabled ? 'idle' : 'review')
  const [error, setError] = useState('')
  const held = useRef(false)
  const alive = useRef(true)
  const take = useRef(0)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const textarea = useRef<HTMLTextAreaElement | null>(null)
  const recordButton = useRef<HTMLButtonElement | null>(null)
  // The control a step change removes hands focus to the next step's control.
  const focusNext = useRef<'answer' | 'record' | null>(null)
  const reviewing = !voiceEnabled || step === 'review' || (step === 'idle' && text !== '')
  const capturing = step === 'permission' || step === 'recording'

  useEffect(() => {
    const target = focusNext.current === 'answer' ? textarea.current : focusNext.current === 'record' ? recordButton.current : null
    focusNext.current = null
    target?.focus()
  })

  function release(cancel = false) {
    held.current = false
    clearTimeout(timer.current)
    const active = recorder.current
    if (cancel) {
      take.current++
      if (active) active.onstop = null
    }
    if (active?.state === 'recording') active.stop()
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
    if (cancel) {
      setStep('idle')
      onBusyChange(false)
    }
  }

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      take.current++
      held.current = false
      clearTimeout(timer.current)
      if (recorder.current) {
        recorder.current.onstop = null
        if (recorder.current.state === 'recording') recorder.current.stop()
      }
      stream.current?.getTracks().forEach((track) => track.stop())
      onBusyChange(false)
    }
  }, [onBusyChange])

  async function start() {
    if (disabled || held.current || step === 'permission' || step === 'recording' || step === 'transcribing') return
    const currentTake = ++take.current
    held.current = true
    setError('')
    setStep('permission')
    onBusyChange(true)
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Voice recording is unavailable in this browser. You can type your answer.')
      }
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 }, video: false })
      if (!alive.current || !held.current || take.current !== currentTake) {
        mic.getTracks().forEach((track) => track.stop())
        if (alive.current && take.current === currentTake) { setStep('idle'); onBusyChange(false) }
        return
      }
      stream.current = mic
      const active = new MediaRecorder(mic)
      recorder.current = active
      const chunks: Blob[] = []
      active.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      active.onerror = () => {
        release(true)
        setError('Recording failed. Please try again or type your answer.')
      }
      active.onstop = async () => {
        release()
        setStep('transcribing')
        try {
          const audio = await recordingToWav(new Blob(chunks, { type: active.mimeType }))
          if (!alive.current || take.current !== currentTake) return
          const data = new FormData()
          data.append('sessionId', sessionId)
          data.append('itemId', itemId)
          data.append('audio', audio)
          const text = await transcribe({ data })
          if (alive.current && take.current === currentTake) { onText(text); focusNext.current = 'answer'; setStep('review') }
        } catch (e) {
          if (alive.current && take.current === currentTake) { setError(errorMessage(e)); setStep('idle') }
        } finally {
          if (alive.current && take.current === currentTake) onBusyChange(false)
        }
      }
      active.start()
      setStep('recording')
      timer.current = setTimeout(() => release(), MAX_VOICE_SECONDS * 1000)
    } catch (e) {
      if (!alive.current || take.current !== currentTake) return
      release(true)
      if (alive.current) setError(e instanceof DOMException && e.name === 'NotAllowedError'
        ? 'Microphone access was denied. Allow it in your browser settings or type your answer.'
        : errorMessage(e))
    }
  }

  function onRecordClick() {
    if (step === 'permission') release(true)
    else if (step === 'recording') release()
    else void start()
  }

  function typeInstead() {
    focusNext.current = 'answer'
    setStep('review')
  }

  const status = step === 'recording' ? 'Recording' : step === 'transcribing' ? 'Turning your recording into text…' : ''

  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="sr-only">{status}</p>
      {reviewing ? (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="answer">Your answer</Label>
            <Textarea
              id="answer"
              ref={textarea}
              rows={4}
              className="field-sizing-fixed"
              maxLength={1000}
              value={text}
              onChange={(e) => {
                // Editing keeps the review step even if the field is cleared.
                setStep('review')
                onText(e.target.value)
              }}
            />
          </div>
          {voiceEnabled && (
            <Button type="button" variant="secondary" className="self-start" disabled={disabled} onClick={() => { focusNext.current = 'record'; void start() }}>
              <Mic className="size-5" aria-hidden />
              Record again
            </Button>
          )}
        </>
      ) : step === 'transcribing' ? (
        <p className="pb-6 text-center text-body text-ink-muted">Turning your recording into text…</p>
      ) : (
        <div className="flex flex-col items-center gap-1 pb-6">
          {capturing && (
            <div aria-hidden className="flex h-8 items-center gap-1">
              {['h-2', 'h-5', 'h-8', 'h-4', 'h-6'].map((h) => (
                <span key={h} className={`w-1 rounded-sm bg-brand ${h}`} />
              ))}
            </div>
          )}
          <Button
            ref={recordButton}
            type="button"
            size="icon"
            aria-label={capturing ? 'Stop recording' : 'Record answer'}
            aria-pressed={capturing}
            disabled={disabled}
            onClick={onRecordClick}
            className={capturing
              ? 'size-16 rounded-full bg-brand-hover text-on-brand ring-2 ring-brand ring-offset-4 ring-offset-surface-page'
              : 'size-16 rounded-full bg-brand text-on-brand'}
          >
            {capturing
              ? <span aria-hidden className="size-3 rounded-[2px] bg-on-brand" />
              : <Mic className="size-6" aria-hidden />}
          </Button>
          <p aria-hidden className="mt-2 text-body text-ink">{capturing ? 'Tap to stop' : 'Tap to record'}</p>
          {!capturing && (
            <Button type="button" variant="link" onClick={typeInstead}>Type instead</Button>
          )}
        </div>
      )}
      {error && <ErrorRow message={error} />}
    </div>
  )
}
