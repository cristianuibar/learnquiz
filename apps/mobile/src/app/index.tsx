import { useCallback, useRef } from 'react'
import { useFocusEffect, useRouter, type Href } from 'expo-router'
import { holdTarget, takeReplayTarget } from '@/lib/held-target'
import { useSession } from '@/lib/session-store'
import { canOpenTarget, homeTarget } from '@/lib/route-gates'

export default function Screen() {
  const session = useSession()
  const router = useRouter()
  const redirected = useRef(false)
  useFocusEffect(useCallback(() => {
    if (session.status === 'loading' || redirected.current) return
    // Protected routes send a newly signed-in learner here. Decide once, after
    // the store unlocks the destination; Disclosure leaves the held link intact.
    const held = session.needsDisclosure ? null : takeReplayTarget()
    const openable = held !== null && canOpenTarget(held, session)
    if (held && !openable) holdTarget(held)
    redirected.current = true
    router.replace((openable ? held : homeTarget(session)) as Href)
  }, [session.status, session.needsDisclosure, router]))
  return null
}
