import * as kv from './kv'

export type PushPermission = 'granted' | 'denied' | 'undetermined'
export type OptInState = {
  finishedSessions: number
  skips: number
  permission: PushPermission
  canAskAgain: boolean
  registered: boolean
}
export type PromptStore = {
  getJSON<T>(key: string): Promise<T | null>
  setJSON(key: string, value: unknown): Promise<void>
}

export const PUSH_TOKEN_KEY = 'lq:push-token'
export const FINISHED_KEY = 'lq:push-prompt:finished'
export const SKIPS_KEY = 'lq:push-prompt:skips'

const MAX_IDS = 50

export function shouldPromptOptIn(s: OptInState): boolean {
  if (s.registered) return false
  const canAsk = s.permission === 'undetermined' || (s.permission === 'denied' && s.canAskAgain)
  if (!canAsk) return false
  return (s.skips === 0 && s.finishedSessions >= 1) || (s.skips === 1 && s.finishedSessions >= 4)
}

type Finished = { count: number; ids: string[] }

function readFinished(raw: unknown): Finished {
  if (
    raw &&
    typeof raw === 'object' &&
    typeof (raw as Finished).count === 'number' &&
    Number.isFinite((raw as Finished).count) &&
    Array.isArray((raw as Finished).ids) &&
    (raw as Finished).ids.every((id) => typeof id === 'string')
  ) {
    return { count: Math.max(0, Math.floor((raw as Finished).count)), ids: (raw as Finished).ids }
  }
  return { count: 0, ids: [] }
}

function readCount(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0
}

// Serialize read-modify-write cycles so concurrent calls never lose updates.
let chain: Promise<unknown> = Promise.resolve()
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task)
  chain = run.catch(() => undefined)
  return run
}

export function recordFinished(sessionId: string, store: PromptStore = kv): Promise<number> {
  return serialize(async () => {
    const current = readFinished(await store.getJSON<unknown>(FINISHED_KEY))
    if (current.ids.includes(sessionId)) return current.count
    const next: Finished = { count: current.count + 1, ids: [...current.ids, sessionId].slice(-MAX_IDS) }
    await store.setJSON(FINISHED_KEY, next)
    return next.count
  })
}

export function recordSkip(store: PromptStore = kv): Promise<number> {
  return serialize(async () => {
    const next = readCount(await store.getJSON<unknown>(SKIPS_KEY)) + 1
    await store.setJSON(SKIPS_KEY, next)
    return next
  })
}

export async function readPromptCounts(
  store: PromptStore = kv,
): Promise<{ finishedSessions: number; skips: number; registered: boolean }> {
  const [finished, skips, token] = await Promise.all([
    store.getJSON<unknown>(FINISHED_KEY),
    store.getJSON<unknown>(SKIPS_KEY),
    store.getJSON<unknown>(PUSH_TOKEN_KEY),
  ])
  return { finishedSessions: readFinished(finished).count, skips: readCount(skips), registered: token != null }
}
