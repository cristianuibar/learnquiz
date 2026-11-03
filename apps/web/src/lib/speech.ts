export function speechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  )
}

export function speak(texts: string[]) {
  if (!speechSupported()) return
  window.speechSynthesis.cancel()
  for (const text of texts) {
    if (!text.trim()) continue
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
  }
}

export function stopSpeaking() {
  if (!speechSupported()) return
  window.speechSynthesis.cancel()
}
