type Effects = {
  frame(callback: () => void): number
  cancelFrame(id: number): void
  announce(message: string): void
}

// Platform-free scheduling: data loading cannot start this clock. The caller
// must have committed an item, whose heading/input takes focus first.
export function createReadyAnnouncement(requested: boolean, effects: Effects) {
  let announced = false
  return (itemRendered: boolean): (() => void) => {
    if (!requested || !itemRendered || announced) return () => {}
    let cancelled = false
    let frame = effects.frame(() => {
      if (cancelled) return
      frame = effects.frame(() => {
        if (cancelled || announced) return
        announced = true
        effects.announce('Your session is ready.')
      })
    })
    return () => {
      cancelled = true
      effects.cancelFrame(frame)
    }
  }
}
