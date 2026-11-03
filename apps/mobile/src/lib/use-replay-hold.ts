import { useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import { deferReplay } from './held-target'

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
    release.current ??= deferReplay()
  }, [])
}
