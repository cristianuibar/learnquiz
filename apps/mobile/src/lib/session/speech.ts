import type { ItemView } from '@learnquiz/api'

export function speechSegments(item: ItemView): string[] {
  const segments = [item.stem.replace(/____/g, 'blank')]
  if (item.image?.alt) segments.push(item.image.alt)
  if (item.format === 'multi') segments.push('Choose all that apply')
  if (item.format === 'order') segments.push('Put the steps in order')
  segments.push(...item.options.map((option) => option.text))
  return segments.filter((segment) => segment.trim().length > 0)
}

type SpeechEffects = {
  speak(text: string, options: { language: string; onError(): void }): void
  stop(): Promise<void>
}

export type SpeechQuestion = {
  item: ItemView | null
  key: string | null
  blocked: boolean
  available: boolean
  foreground: boolean
}

// One controller belongs to one session. It never stores a learner's answer.
export function createReadAloud(effects: SpeechEffects, onEnabledChange: (enabled: boolean) => void) {
  let question: SpeechQuestion = { item: null, key: null, blocked: false, available: false, foreground: true }
  let enabled = false
  let disposed = false
  let handledKey: string | null = null
  let generation = 0
  let speaking = false
  let stopped = Promise.resolve()

  function cancel() {
    generation += 1
    if (!speaking) return
    speaking = false
    // Stop immediately; a replacement waits until every earlier stop settles.
    try {
      stopped = Promise.all([stopped, effects.stop().catch(() => {})]).then(() => {})
    } catch {
      // A missing native engine must not break answering a question.
    }
  }

  function read() {
    if (disposed || !enabled || !question.available || question.blocked || !question.foreground || !question.item || !question.key || handledKey === question.key) return
    handledKey = question.key
    const segments = speechSegments(question.item)
    const current = ++generation
    speaking = true
    const failed = () => {
      if (disposed || generation !== current) return
      cancel()
      enabled = false
      onEnabledChange(false)
    }
    void stopped.then(() => {
      for (const segment of segments) {
        if (disposed || generation !== current) return
        try {
          effects.speak(segment, { language: 'en-US', onError: failed })
        } catch {
          failed()
          return
        }
      }
    })
  }

  return {
    update(next: SpeechQuestion) {
      if (disposed) return
      const changed = next.key !== question.key
      const interrupted = (!question.blocked && next.blocked) || (question.foreground && !next.foreground)
      if (changed || !next.available || next.blocked || !next.foreground) cancel()
      if (changed) handledKey = null
      question = next
      // Check and backgrounding consume this reading, even if the request fails
      // or the same item is refetched. The next question still reads aloud.
      if (interrupted && !changed) handledKey = next.key
      if (!next.available && enabled) {
        enabled = false
        onEnabledChange(false)
      }
      read()
    },
    toggle() {
      if (disposed || !question.available || !question.item || question.blocked || !question.foreground) return
      cancel()
      enabled = !enabled
      onEnabledChange(enabled)
      handledKey = null
      read()
    },
    dispose() {
      disposed = true
      enabled = false
      cancel()
    },
  }
}
