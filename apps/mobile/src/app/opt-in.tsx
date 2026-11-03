import { useCallback, useEffect, useRef, useState } from 'react'
import { BackHandler, View, type Text as NativeText } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { describeWindow, type PushSchedule } from '@learnquiz/api/schedule'
import { AlertRow } from '@/components/ui/AlertRow'
import { Button } from '@/components/ui/Button'
import { Screen, useHeadingFocus } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { OptInPreview } from '@/components/after-session/OptInPreview'
import { api } from '@/lib/api'
import { enablePush } from '@/lib/push'
import { recordSkip } from '@/lib/push-prompt'
import { useTheme } from '@/theme/ThemeProvider'

const TODAY = '/(tabs)/today'
const LOAD_ERROR = 'Couldn’t load the details. Check your connection and try again.'

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; schedule: PushSchedule }

export default function OptIn() {
  const router = useRouter()
  const { colors, space, radius } = useTheme()
  const headingRef = useRef<NativeText | null>(null)
  useHeadingFocus(headingRef)
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [pending, setPending] = useState(false)
  const busyRef = useRef(false)

  const toToday = useCallback(() => router.dismissTo(TODAY), [router])

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    api<{ schedule: PushSchedule }>('/push/settings', { signal: controller.signal })
      .then(
        ({ schedule }) => {
          if (!controller.signal.aborted) setState({ status: 'ready', schedule })
        },
        () => {
          if (!controller.signal.aborted) setState({ status: 'error' })
        },
      )
    return () => controller.abort()
  }, [attempt])

  // Leaving without turning on counts as one skip, then back to Today.
  // The busy guard keeps Not now and Android Back from recording twice.
  const skipToToday = useCallback(() => {
    if (busyRef.current) return
    busyRef.current = true
    setPending(true)
    void recordSkip().catch(() => undefined).finally(toToday)
  }, [toToday])

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      skipToToday()
      return true
    })
    return () => subscription.remove()
  }, [skipToToday]))

  const handleTurnOn = useCallback(() => {
    if (busyRef.current) return
    busyRef.current = true
    setPending(true)
    // Whatever the result, the learner ends up on Today.
    void enablePush().catch(() => undefined).finally(toToday)
  }, [toToday])

  const ready = state.status === 'ready'
  const facts = ready ? describeFacts(state.schedule) : []

  return (
    <Screen
      dock={
        <View style={{ gap: space[1] }}>
          <Button size="lg" disabled={!ready || pending} busy={pending} onPress={handleTurnOn}>
            Turn on questions
          </Button>
          <Button variant="ghost" disabled={pending} onPress={skipToToday}>
            Not now
          </Button>
        </View>
      }
    >
      <Text ref={headingRef} header variant="title1">
        Get a question during your shift?
      </Text>
      {state.status === 'loading' ? (
        <View style={{ gap: space[4] }}>
          <Text muted accessibilityLiveRegion="polite">
            Getting the details
          </Text>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ gap: space[4] }}
          >
            <View style={{ minHeight: space[12] + space[4], borderRadius: radius.lg, backgroundColor: colors.surfaceSunken }} />
            <View style={{ gap: space[3] }}>
              <View style={{ minHeight: space[6], borderRadius: radius.md, backgroundColor: colors.surfaceSunken }} />
              <View style={{ minHeight: space[6], borderRadius: radius.md, backgroundColor: colors.surfaceSunken }} />
              <View style={{ minHeight: space[6], borderRadius: radius.md, backgroundColor: colors.surfaceSunken }} />
            </View>
          </View>
        </View>
      ) : state.status === 'error' ? (
        <View style={{ gap: space[4] }}>
          <AlertRow>{LOAD_ERROR}</AlertRow>
          <Button variant="secondary" onPress={() => setAttempt((value) => value + 1)}>
            Try again
          </Button>
        </View>
      ) : (
        <>
          {state.schedule.preview ? <OptInPreview stem={state.schedule.preview} /> : null}
          <View style={{ gap: space[3] }}>
            {facts.map((fact) => (
              <Text key={fact} variant="bodyLg" num>
                {fact}
              </Text>
            ))}
          </View>
        </>
      )}
    </Screen>
  )
}

function describeFacts(schedule: PushSchedule): string[] {
  const facts = [
    schedule.phase === 'steady'
      ? `Up to ${schedule.steadyCap} a day.`
      : `Up to ${schedule.dailyCap} a day while you’re onboarding, then ${schedule.steadyCap}.`,
    `Only ${describeWindow(schedule.window)}.`,
    'Skip any. Nothing is lost.',
  ]
  return facts
}
