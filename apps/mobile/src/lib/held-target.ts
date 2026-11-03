// In-memory holder for a deferred navigation target (e.g. a deep link that
// arrives before auth finishes). Latest write wins; taking consumes the value
// exactly once so it can never be replayed after a later sign-in.
let held: string | null = null

export function holdTarget(path: string): void {
  held = path
}

export function takeHeldTarget(): string | null {
  const target = held
  held = null
  return target
}

// While a screen owns the next navigation (the join flow between sign-up and
// accept), the root layout must not replay a held link. Each hold is a token:
// releasing it twice, or after sign-out dropped every hold, does nothing.
const holds = new Set<symbol>()
const listeners = new Set<() => void>()
let version = 0

function holdsEnded() {
  // The layout replays when its snapshot changes; only worth it with a link waiting.
  if (held === null) return
  version++
  for (const listener of listeners) listener()
}

export function deferReplay(): () => void {
  const hold = Symbol('replay hold')
  holds.add(hold)
  return () => {
    if (holds.delete(hold) && holds.size === 0) holdsEnded()
  }
}

// Sign-out ends every join attempt, so no stale hold can block a later session.
export function releaseReplayHolds(): void {
  if (holds.size === 0) return
  holds.clear()
  holdsEnded()
}

// For useSyncExternalStore in the root layout: changes when the last hold ends.
export function subscribeReplay(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function replayVersion(): number {
  return version
}

// The root layout's replay: nothing while deferred, and the link stays held.
export function takeReplayTarget(): string | null {
  return holds.size > 0 ? null : takeHeldTarget()
}
