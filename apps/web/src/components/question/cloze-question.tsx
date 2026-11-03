import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { VoiceAnswer } from '@/components/voice-answer'
import type { QuestionProps } from '@/components/question/question-screen'

export function ClozeQuestion({ item, sessionId, voiceEnabled, choice, onChoice, busy, voiceBusy, onVoiceBusy }: QuestionProps) {
  return (
    <div className="flex flex-col gap-4">
      <Label htmlFor="answer" className="sr-only">
        {item.stem}
      </Label>
      <Input
        id="answer"
        value={choice}
        onChange={(e) => onChoice(e.target.value)}
        maxLength={1000}
        disabled={voiceBusy}
        autoComplete="off"
      />
      {voiceEnabled && (
        <VoiceAnswer key={item.id} sessionId={sessionId} itemId={item.id} disabled={busy} onTranscript={onChoice} onBusyChange={onVoiceBusy} />
      )}
    </div>
  )
}
