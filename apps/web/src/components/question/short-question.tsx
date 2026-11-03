import { VoiceAnswer } from '@/components/voice-answer'
import type { QuestionProps } from '@/components/question/question-screen'

export function ShortQuestion({ item, sessionId, voiceEnabled, choice, onChoice, busy, onVoiceBusy }: QuestionProps) {
  return (
    <VoiceAnswer
      key={item.id}
      sessionId={sessionId}
      itemId={item.id}
      voiceEnabled={voiceEnabled}
      text={choice}
      onText={onChoice}
      disabled={busy}
      onBusyChange={onVoiceBusy}
    />
  )
}
