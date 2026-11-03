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
// accept), the root layout must not replay a held link. Holds nest.
let deferrals = 0

export function deferReplay(): () => void {
  deferrals++
  let released = false
  return () => {
    if (released) return
    released = true
    deferrals--
  }
}

// The root layout's replay: nothing while deferred, and the link stays held.
export function takeReplayTarget(): string | null {
  return deferrals > 0 ? null : takeHeldTarget()
}
