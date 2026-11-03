import { Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { speak, speechSupported, stopSpeaking } from '@/lib/speech'

export function ReadAloudButton({ texts }: { texts: string[] | null }) {
  const [supported, setSupported] = useState(false)
  const [on, setOn] = useState(false)
  const key = texts?.join('\n') ?? null

  useEffect(() => {
    setSupported(speechSupported())
  }, [])

  useEffect(() => {
    if (!on || !texts) return
    speak(texts)
    return () => stopSpeaking()
  }, [on, key])

  if (!supported) return null

  return (
    <button
      type="button"
      aria-label="Read aloud"
      aria-pressed={on}
      onClick={() => setOn((v) => !v)}
      className={`flex size-12 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
        on ? 'bg-brand-tint text-brand' : 'text-ink hover:bg-surface-sunken'
      }`}
    >
      <Volume2 className="size-6" aria-hidden />
    </button>
  )
}
