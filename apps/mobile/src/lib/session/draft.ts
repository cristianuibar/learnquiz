import type { Draft, SessionView } from '@learnquiz/api'
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

export function draftOnViewChange(
  previous: SessionView | null,
  next: SessionView,
  checkedItemId?: string,
): 'keep' | 'empty' | 'restore' {
  if (next.item?.id === checkedItemId && checkedItemId !== undefined) return 'empty'
  if (next.item?.id === previous?.item?.id && next.progress.position === previous?.progress.position) return 'keep'
  // A new slot for the same item is a re-ask, not an unfinished answer.
  return next.item && next.item.id !== previous?.item?.id ? 'restore' : 'empty'
}

// null keeps the current selections, error and retry request for an unchanged slot.
export async function draftForView(
  sessionId: string,
  previous: SessionView | null,
  next: SessionView,
  checkedItemId?: string,
): Promise<Draft | null> {
  const action = draftOnViewChange(previous, next, checkedItemId)
  if (action === 'keep') return null
  if (previous?.item) await deleteDraft(sessionId, previous.item.id).catch(() => {})
  if (checkedItemId && checkedItemId !== previous?.item?.id) await deleteDraft(sessionId, checkedItemId).catch(() => {})
  if (action === 'restore' && next.item) {
    const restored = await readDraft(sessionId, next.item.id).catch(() => null)
    if (restored) return restored
  }
  return { answer: {}, confidence: null }
}
