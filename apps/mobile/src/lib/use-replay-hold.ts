import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useFocusEffect, useRoute } from 'expo-router'
import { deferReplay, holdJoinAttempt } from './held-target'

// A hold on the root layout's held-link replay that lasts only while the calling
// screen owns navigation: it ends when the screen loses focus (another screen
// pushed on top) or unmounts. Sign-out ends it too (releaseReplayHolds).
export function useReplayHold(): () => void {
  const release = useRef<(() => void) | null>(null)
  useFocusEffect(useCallback(() => () => {
    release.current?.()
    release.current = null
  }, []))
  return useCallback(() => {
    // Always take a fresh hold: sign-out may have dropped the previous one. Take
    // the new hold before releasing the old so replay never opens in between.
    const next = deferReplay()
    release.current?.()
    release.current = next
  }, [])
}

// The join attempt hold (holdJoinAttempt) for one screen, owned by its route key:
// begin on submit, end when the screen acts on the result. Unmount ends it too,
// and so does sign-out.
export function useAttemptHold(): { begin: () => void; end: () => void } {
  const owner = useRoute().key
  const release = useRef<(() => void) | null>(null)
  const end = useCallback(() => {
    release.current?.()
    release.current = null
  }, [])
  const begin = useCallback(() => {
    const next = holdJoinAttempt(owner)
    release.current?.()
    release.current = next
  }, [owner])
  useEffect(() => end, [end])
  return useMemo(() => ({ begin, end }), [begin, end])
}
