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
