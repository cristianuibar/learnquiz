import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AccessibilityInfo, AppState, BackHandler } from 'react-native'
import { requestRecordingPermissionsAsync, useAudioStream } from 'expo-audio'
import { VOICE_SAMPLE_RATE } from '@learnquiz/api/voice'
import { postForm } from '../../../lib/api'
import { VoiceAnswerController, type VoicePorts, type VoiceState } from '../../../lib/session/voice'
import { wavDataUri } from '../../../lib/session/wav'

const TRANSCRIBE_TIMEOUT_MS = 90_000

// Binds the voice answer state machine to the microphone (expo-audio's PCM
// stream), the transcribe endpoint, TalkBack and Android lifecycle events.
export function useVoiceAnswer({ sessionId, itemId, text, onText, disabled, focus }: {
  sessionId: string
  itemId: string
  text: string
  onText(text: string | undefined): void
  disabled: boolean
  focus: VoicePorts['focus']
}): { state: VoiceState; voice: VoiceAnswerController } {
  const latest = useRef({ sessionId, itemId, text, onText, focus })
  latest.current = { sessionId, itemId, text, onText, focus }
  const controller = useRef<VoiceAnswerController | null>(null)
  const { stream } = useAudioStream({
    sampleRate: VOICE_SAMPLE_RATE,
    channels: 1,
    encoding: 'int16',
    onBuffer: (buffer) => {
      try {
        controller.current?.buffer(buffer)
      } catch {
        controller.current?.streamError()
      }
    },
  })
  const streamRef = useRef(stream)
  streamRef.current = stream

  const [voice] = useState(() => new VoiceAnswerController({
    async permission() {
      const response = await requestRecordingPermissionsAsync()
      return { granted: response.granted, canAskAgain: response.canAskAgain }
    },
    async start() {
      // Read aloud must not end up in the recording.
      await import('expo-speech').then((speech) => speech.stop()).catch(() => {})
      await streamRef.current.start()
    },
    stop() {
      try { streamRef.current.stop() } catch { /* already released */ }
    },
    upload(wav, signal) {
      const form = new FormData()
      form.append('itemId', latest.current.itemId)
      // React Native sends a { uri, name, type } part as a file; the data: URI keeps it in memory.
      form.append('audio', { uri: wavDataUri(wav), name: 'answer.wav', type: 'audio/wav' } as unknown as Blob)
      return postForm<unknown>(`/sessions/${encodeURIComponent(latest.current.sessionId)}/transcribe`, form, TRANSCRIBE_TIMEOUT_MS, signal)
    },
    announce: (message) => AccessibilityInfo.announceForAccessibility(message),
    focus: (target) => latest.current.focus(target),
    now: () => Date.now(),
  }, {
    text: () => latest.current.text,
    setText(next) {
      latest.current.text = next ?? ''
      latest.current.onText(next)
    },
  }, true))
  controller.current = voice
  voice.setDisabled(disabled)

  const state = useSyncExternalStore(voice.subscribe, voice.getState)
  const capturing = state.step === 'requesting' || state.step === 'recording' || state.step === 'transcribing'

  // Leaving the app drops the recording and frees the microphone.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') voice.background()
    })
    return () => subscription.remove()
  }, [voice])

  // Registered after the session screen's handler, so it runs first: the first
  // Back discards the recording, the next one reaches the screen and leaves.
  useEffect(() => {
    if (!capturing) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => voice.discard())
    return () => subscription.remove()
  }, [capturing, voice])

  // End session and leaving the question unmount the body. The stream's own
  // release also stops the native AudioRecord, whichever cleanup runs first.
  useEffect(() => () => voice.dispose(), [voice])

  return { state, voice }
}
