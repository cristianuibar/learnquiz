import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter'
import { useURL } from 'expo-linking'
import { Stack, usePathname, useRootNavigationState, useRouter, type Href } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { SessionProvider, useSession } from '@/lib/session-store'
import { holdTarget, joinAttemptHeld, replayVersion, subscribeReplay, takeReplayTarget } from '@/lib/held-target'
import { canOpenTarget, targetFromURL } from '@/lib/route-gates'
import { useNotificationObserver } from '@/lib/notification-observer'

SplashScreen.preventAutoHideAsync()

type NavState = { index?: number; routes: { key: string; state?: NavState }[] }

// The key of the screen in front: the focused route, all the way down.
function focusedRouteKey(state: NavState | undefined): string | null {
  const route = state?.routes[state.index ?? state.routes.length - 1]
  if (!route) return null
  return focusedRouteKey(route.state) ?? route.key
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  })

  useEffect(() => {
    if (error) throw error
  }, [error])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <SessionProvider>
            <SessionRoutes fontsLoaded={loaded} />
          </SessionProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

function SessionRoutes({ fontsLoaded }: { fontsLoaded: boolean }) {
  const session = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const url = useURL()
  const focusedKey = focusedRouteKey(useRootNavigationState() as NavState | undefined)
  const lastURL = useRef<string | null>(null)
  const mounted = useRef(false)
  // Set while the resolved stack shows sign-in, until the next resolved screen.
  const fromSignIn = useRef(false)
  // Set once the first session resolved. A later loading (a new bearer waiting
  // for /session) keeps the stack, so an open invitation stays mounted.
  const [booted, setBooted] = useState(false)
  const resolved = fontsLoaded && session.status !== 'loading'
  useNotificationObserver(resolved && session.status === 'ready' && !session.needsDisclosure)
  // Re-runs the replay below when the last hold on it ends.
  const replays = useSyncExternalStore(subscribeReplay, replayVersion)

  useEffect(() => {
    if (url && url !== lastURL.current) {
      lastURL.current = url
      const target = targetFromURL(url)
      if (target && !canOpenTarget(target, session)) holdTarget(target)
    }
    // Sign-in over Join: removing the protected sign-in screen uncovers Join, not
    // index. Hand the post-auth decision to index, as when sign-in sits over it,
    // unless that Join's own attempt still runs: then it navigates or shows its retry.
    if (resolved) {
      const signedInOverJoin = fromSignIn.current && session.status === 'ready' && pathname.startsWith('/join/')
      fromSignIn.current = pathname === '/sign-in'
      if (signedInOverJoin) {
        if (!focusedKey || !joinAttemptHeld(focusedKey)) router.replace('/')
        return
      }
    }
    // The native router handles open links. Only replay links held by a gate.
    // index owns the gate's destination, including the protected sign-in screen
    // being removed. Replaying here would race index's fallback and lose a link.
    if (!resolved || pathname === '/' || pathname === '/sign-in') return
    const target = takeReplayTarget()
    if (target) {
      if (canOpenTarget(target, session)) router.replace(target as Href)
      else holdTarget(target)
    }
  }, [url, session.status, session.needsDisclosure, resolved, router, replays, pathname, focusedKey])

  useEffect(() => {
    if (resolved && !mounted.current) {
      mounted.current = true
      setBooted(true)
      void SplashScreen.hideAsync()
    }
  }, [resolved])

  if (!resolved && !booted) return null
  const signedIn = session.status === 'ready'
  return (
    <ThemeProvider accent={session.branding?.accent}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="join/[invitationId]" />
        <Stack.Protected guard={session.status === 'signedOut'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="welcome" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !session.needsDisclosure}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="play/loading" />
          <Stack.Screen name="play/quick/[itemId]" />
          <Stack.Screen name="play/[sessionId]/index" />
          <Stack.Screen name="play/[sessionId]/done" />
          <Stack.Screen name="opt-in" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="unit/[unitId]" />
          <Stack.Screen name="flag" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  )
}
