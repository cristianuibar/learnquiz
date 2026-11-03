import { useEffect, useRef } from 'react'
import * as Notifications from 'expo-notifications'
import { useRouter } from 'expo-router'
import { holdTarget } from '@/lib/held-target'

export interface QuickRoute {
  itemId: string
  pushId?: string
}

// Exact deep-link shape only. `$` alone tolerates a trailing newline, so the
// full-match length check in quickRoute rejects it.
const QUICK_RE = /^\/play\/quick\/([A-Za-z0-9_-]+)(\?pushId=([A-Za-z0-9_-]+))?$/

export function quickRoute(url: unknown): QuickRoute | null {
  if (typeof url !== 'string' || url.length === 0) return null
  const match = QUICK_RE.exec(url)
  if (!match || match[0].length !== url.length) return null
  if (match[3] === undefined) return { itemId: match[1] }
  return { itemId: match[1], pushId: match[3] }
}

export function useNotificationObserver(ready: boolean): void {
  const router = useRouter()
  const readyRef = useRef(ready)
  readyRef.current = ready
  const routerRef = useRef(router)
  routerRef.current = router

  useEffect(() => {
    let cancelled = false
    const seen = new Set<string>()

    const handle = (response: Notifications.NotificationResponse): void => {
      if (cancelled || !response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return
      const request = response.notification?.request
      const data = request?.content?.data as Record<string, unknown> | undefined
      const parsed = quickRoute(data?.url)
      if (!parsed) return
      const id = request?.identifier
      if (typeof id === 'string') {
        if (seen.has(id)) return
        seen.add(id)
      }
      const path =
        parsed.pushId === undefined
          ? `/play/quick/${parsed.itemId}`
          : `/play/quick/${parsed.itemId}?pushId=${parsed.pushId}`
      if (readyRef.current) routerRef.current.push(path)
      else holdTarget(path)
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(handle)
    Notifications.getLastNotificationResponseAsync().then(
      (last) => {
        if (!cancelled && last) handle(last)
      },
      () => {
        // Swallowed: the cold-start lookup must never break startup or the listener.
      },
    )
    return () => {
      cancelled = true
      subscription.remove()
    }
  }, [])
}
