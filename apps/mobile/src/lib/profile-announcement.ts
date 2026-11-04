// One-shot handoff to Profile, where heading focus owns TalkBack's first frame.
// Memory only: a result from one bearer must never speak in another session.
let flagOwner: string | null = null

export function queueFlagSent(token: string) {
  flagOwner = token
}

export function takeFlagSent(token: string | null): boolean {
  const pending = flagOwner
  flagOwner = null
  return pending !== null && pending === token
}
