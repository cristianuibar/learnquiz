// Pure form and response rules; the screen owns transport and navigation.
export function flagNoteValid(note: string): boolean {
  return note.trim().length > 0 && note.length <= 500
}

export function resultFlagBody(conceptId: string | undefined, note: string) {
  if (!conceptId?.trim() || !flagNoteValid(note)) return null
  return { conceptId, note: note.trim() }
}

type Result = { response: unknown } | { error: unknown }
type Outcome = { kind: 'sent' } | { kind: 'ignore' } | { kind: 'error'; message: string }

export function resultFlagOutcome(result: Result, current: boolean): Outcome {
  if (!current) return { kind: 'ignore' }
  if ('error' in result && result.error && typeof result.error === 'object' && 'status' in result.error && result.error.status === 401) {
    return { kind: 'ignore' }
  }
  if ('response' in result && result.response && typeof result.response === 'object' && 'ok' in result.response && result.response.ok === true) {
    return { kind: 'sent' }
  }
  return { kind: 'error', message: 'Could not send your flag. Try again.' }
}
