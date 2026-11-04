import { checkReachability } from './api'

export const REACHABILITY_INTERVAL_MS = 3_000
export const REACHABILITY_TIMEOUT_MS = 3_000

// JS-only fallback: mobile has no installed network-state native module. Check
// immediately, then at most one small request at a time; callers own lifecycle.
export function watchReachability(onChange: (reachable: boolean) => void): () => void {
  let stopped = false
  let controller: AbortController | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  let next: ReturnType<typeof setTimeout> | undefined
  let failures = 0
  const check = async () => {
    controller = new AbortController()
    timeout = setTimeout(() => controller?.abort(), REACHABILITY_TIMEOUT_MS)
    try {
      await checkReachability(controller.signal)
      if (!stopped) {
        failures = 0
        onChange(true)
      }
    } catch {
      if (!stopped && ++failures >= 2) onChange(false)
    } finally {
      clearTimeout(timeout)
      if (!stopped) next = setTimeout(() => { void check() }, REACHABILITY_INTERVAL_MS)
    }
  }
  void check()
  return () => {
    stopped = true
    clearTimeout(timeout)
    clearTimeout(next)
    controller?.abort()
  }
}
