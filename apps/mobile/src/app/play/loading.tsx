import { loadingTitle, startSlow } from '@learnquiz/api/system-copy'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { X } from 'lucide-react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, BackHandler, View, type Text as NativeText } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SessionSkeleton } from '@/components/session-skeleton'
import { AlertRow } from '@/components/ui/AlertRow'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Screen, useHeadingFocus } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { useSession } from '@/lib/session-store'
import { beginStartPlay, type StartFailure } from '@/lib/start-play'
import { useTheme } from '@/theme/ThemeProvider'

const preparingStatus = 'Getting your questions ready.'

// Heading focus runs on the first frame. Speak on the following frame so
// TalkBack does not interrupt the status with the heading's focus event.
function announceAfterFocus(message: string): () => void {
  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => AccessibilityInfo.announceForAccessibility(message))
  })
  return () => cancelAnimationFrame(frame)
}

export default function LoadingScreen() {
  const params = useLocalSearchParams<{
    topicId?: string | string[]
    start?: string | string[]
    unitId?: string | string[]
  }>()
  const topicId = typeof params.topicId === 'string' ? params.topicId : undefined
  const start = params.start === 'session' || params.start === 'placement' ? params.start : undefined
  const unitId = typeof params.unitId === 'string' ? params.unitId : undefined
  const router = useRouter()
  const session = useSession()
  const { space, sizes } = useTheme()
  const insets = useSafeAreaInsets()
  const heading = useRef<NativeText>(null)
  const request = useRef<ReturnType<typeof beginStartPlay> | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [slow, setSlow] = useState(false)
  const [failure, setFailure] = useState<StartFailure | null>(null)
  useHeadingFocus(heading)

  useEffect(() => {
    if (session.status !== 'ready' || session.needsDisclosure) return
    setSlow(false)
    setFailure(null)
    if (!topicId || !start) {
      setFailure({ message: 'Open a session from Today to try again.', retry: false })
      return
    }
    const cancelPreparing = announceAfterFocus(preparingStatus)
    const current = beginStartPlay({ topicId, start, unitId }, {
      onSlow: () => setSlow(true),
      onFailure: (error) => {
        cancelPreparing()
        setFailure(error)
      },
      // Navigation happens first. This announcement intentionally survives
      // Loading's unmount and follows the destination heading's focus frame.
      onReady: () => {
        cancelPreparing()
        announceAfterFocus('Your session is ready.')
      },
      replace: (path) => router.replace(path),
      dismissAll: () => router.dismissAll(),
    })
    request.current = current
    return () => {
      cancelPreparing()
      current.dispose()
      if (request.current === current) request.current = null
    }
  }, [topicId, start, unitId, attempt, session.status, session.user?.id, session.needsDisclosure, router])

  const cancel = useCallback(() => {
    if (request.current) request.current.cancel()
    else {
      router.dismissAll()
      router.replace('/(tabs)/today')
    }
  }, [router])

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      cancel()
      return true
    })
    return () => subscription.remove()
  }, [cancel]))

  return (
    <Screen contentContainerStyle={{
      paddingTop: 0,
      paddingHorizontal: 0,
      paddingBottom: Math.max(space[2], insets.bottom),
      gap: 0,
    }}>
      <View style={{ minHeight: sizes.topbarH, paddingHorizontal: space[2], justifyContent: 'center' }}>
        <IconButton accessibilityLabel="Cancel" icon={X} onPress={cancel} />
      </View>
      <View style={{ flexGrow: 1, paddingTop: space[2], paddingHorizontal: space[4], paddingBottom: space[6], gap: space[6] }}>
        {!failure && <SessionSkeleton />}
        <View style={{ marginTop: 'auto', gap: space[3] }}>
          <Text ref={heading} header variant="title2" style={{ textAlign: 'center' }}>{loadingTitle}</Text>
          {failure ? (
            <>
              <AlertRow>{failure.title ? `${failure.title}\n${failure.message}` : failure.message}</AlertRow>
              {failure.retry && <Button size="lg" onPress={() => setAttempt((previous) => previous + 1)}>Try again</Button>}
            </>
          ) : (
            <Text role="status" accessibilityLiveRegion="none" muted style={{ textAlign: 'center' }}>
              {slow ? startSlow : preparingStatus}
            </Text>
          )}
        </View>
      </View>
    </Screen>
  )
}
