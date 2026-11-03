import type { Draft } from '@learnquiz/api'
import { getJSON, remove, setJSON } from '../kv'

const pending = new Map<string, Promise<void>>()

function draftKey(sessionId: string, itemId: string) {
  return `lq:draft:${sessionId}:${itemId}`
}

// A slow write must finish before a later delete so Check cannot resurrect a draft.
function mutate(key: string, operation: () => Promise<void>): Promise<void> {
  const next = (pending.get(key) ?? Promise.resolve()).catch(() => {}).then(operation)
  pending.set(key, next)
  const cleanup = () => {
    if (pending.get(key) === next) pending.delete(key)
  }
  void next.then(cleanup, cleanup)
  return next
}

export async function readDraft(sessionId: string, itemId: string): Promise<Draft | null> {
  const key = draftKey(sessionId, itemId)
  await pending.get(key)?.catch(() => {})
  return getJSON<Draft>(key)
}

export function writeDraft(sessionId: string, itemId: string, draft: Draft): Promise<void> {
  const value: Draft = {
    answer: {
      ...draft.answer,
      ...(draft.answer.optionIds ? { optionIds: [...draft.answer.optionIds] } : {}),
      ...(draft.answer.order ? { order: [...draft.answer.order] } : {}),
    },
    confidence: draft.confidence,
  }
  const key = draftKey(sessionId, itemId)
  return mutate(key, () => setJSON(key, value))
}

export function deleteDraft(sessionId: string, itemId: string): Promise<void> {
  const key = draftKey(sessionId, itemId)
  return mutate(key, () => remove(key))
}
