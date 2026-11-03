import { useEffect, useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/components/inline-error'
import { MAX_VOICE_SECONDS, recordingToWav } from '@/lib/voice'
import { transcribeAnswer } from '@/server/play'

export function VoiceAnswer({ sessionId, itemId, disabled, onTranscript, onBusyChange }: {
  sessionId: string
  itemId: string
  disabled: boolean
  onTranscript: (text: string) => void
  onBusyChange: (busy: boolean) => void
}) {
  const transcribe = useServerFn(transcribeAnswer)
  const [state, setState] = useState<'idle' | 'permission' | 'recording' | 'transcribing' | 'done'>('idle')
  const [error, setError] = useState('')
  const held = useRef(false)
  const alive = useRef(true)
  const take = useRef(0)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

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
      setState('idle')
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
    if (disabled || held.current || state === 'permission' || state === 'recording' || state === 'transcribing') return
    const currentTake = ++take.current
    held.current = true
    setError('')
    setState('permission')
    onBusyChange(true)
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Voice recording is unavailable in this browser. You can type your answer.')
      }
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 }, video: false })
      if (!alive.current || !held.current || take.current !== currentTake) {
        mic.getTracks().forEach((track) => track.stop())
        if (alive.current && take.current === currentTake) { setState('idle'); onBusyChange(false) }
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
        setState('transcribing')
        try {
          const audio = await recordingToWav(new Blob(chunks, { type: active.mimeType }))
          if (!alive.current || take.current !== currentTake) return
          const data = new FormData()
          data.append('sessionId', sessionId)
          data.append('itemId', itemId)
          data.append('audio', audio)
          const text = await transcribe({ data })
          if (alive.current && take.current === currentTake) { onTranscript(text); setState('done') }
        } catch (e) {
          if (alive.current && take.current === currentTake) { setError(errorMessage(e)); setState('idle') }
        } finally {
          if (alive.current && take.current === currentTake) onBusyChange(false)
        }
      }
      active.start()
      setState('recording')
      timer.current = setTimeout(() => release(), MAX_VOICE_SECONDS * 1000)
    } catch (e) {
      if (!alive.current || take.current !== currentTake) return
      release(true)
      if (alive.current) setError(e instanceof DOMException && e.name === 'NotAllowedError'
        ? 'Microphone access was denied. Allow it in your browser settings or type your answer.'
        : errorMessage(e))
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        className="touch-none select-none"
        aria-pressed={state === 'recording'}
        aria-describedby="voice-status"
        disabled={disabled || state === 'transcribing'}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          void start()
        }}
        onPointerUp={() => release()}
        onPointerCancel={() => release(true)}
        onLostPointerCapture={() => { if (held.current) release(true) }}
        onKeyDown={(event) => {
          if (event.key !== ' ' && event.key !== 'Enter') return
          event.preventDefault()
          if (!event.repeat) void start()
        }}
        onKeyUp={(event) => {
          if (event.key !== ' ' && event.key !== 'Enter') return
          event.preventDefault()
          release()
        }}
        onBlur={() => { if (held.current) release(true) }}
        onClick={(event) => {
          // Assistive technology can activate a button without pointer/key events.
          if (event.detail === 0) { if (held.current) release(); else void start() }
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        {state === 'recording' ? 'Release to transcribe' : state === 'transcribing' ? 'Transcribing…' : 'Hold to answer by voice'}
      </Button>
      <p id="voice-status" role="status" className="text-sm text-muted-foreground">
        {state === 'permission' ? 'Allow microphone access, then hold the button to speak.'
          : state === 'recording' ? 'Listening. Release when finished (up to one minute).'
          : state === 'transcribing' ? 'Turning your recording into text…'
          : state === 'done' ? 'Transcript ready. Edit your answer, then press Check.'
          : 'Hold the button or the Space key to speak. Your recording is sent for transcription when you release.'}
      </p>
      {error && <p role="alert" className="text-sm text-ink">{error}</p>}
    </div>
  )
}
