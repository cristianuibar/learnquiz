import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter'
import { useURL } from 'expo-linking'
import { Stack, useRouter, type Href } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useRef } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { SessionProvider, useSession } from '@/lib/session-store'
import { holdTarget, takeReplayTarget } from '@/lib/held-target'
import { canOpenTarget, targetFromURL } from '@/lib/route-gates'
import { useNotificationObserver } from '@/lib/notification-observer'

SplashScreen.preventAutoHideAsync()

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
  const url = useURL()
  const lastURL = useRef<string | null>(null)
  const mounted = useRef(false)
  const resolved = fontsLoaded && session.status !== 'loading'
  useNotificationObserver(resolved && session.status === 'ready' && !session.needsDisclosure)

  useEffect(() => {
    if (url && url !== lastURL.current) {
      lastURL.current = url
      const target = targetFromURL(url)
      if (target && !canOpenTarget(target, session)) holdTarget(target)
    }
    // The native router handles open links. Only replay links held by a gate.
    if (!resolved) return
    const target = takeReplayTarget()
    if (target) {
      if (canOpenTarget(target, session)) router.replace(target as Href)
      else holdTarget(target)
    }
  }, [url, session.status, session.needsDisclosure, resolved, router])

  useEffect(() => {
    if (resolved && !mounted.current) {
      mounted.current = true
      void SplashScreen.hideAsync()
    }
  }, [resolved])

  if (!resolved) return null
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
