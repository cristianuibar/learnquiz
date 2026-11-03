import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { BackHandler, View, type Text as NativeText } from 'react-native'
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import * as Notifications from 'expo-notifications'
import type { SummaryView } from '@learnquiz/api'
import { ApiError, api } from '@/lib/api'
import { readPromptCounts, recordFinished, shouldPromptOptIn, type PushPermission } from '@/lib/push-prompt'
import { scoreLine, streakLabel } from '@/lib/summary-format'
import { useTheme } from '@/theme/ThemeProvider'
import { AlertRow } from '@/components/ui/AlertRow'
import { Button } from '@/components/ui/Button'
import { LinkButton } from '@/components/ui/LinkButton'
import { Screen, useHeadingFocus } from '@/components/ui/Screen'
import { StreakPill } from '@/components/ui/StreakPill'
import { Text } from '@/components/ui/Text'
import { CoachNote } from '@/components/after-session/CoachNote'
import { MasteryMoved } from '@/components/after-session/MasteryMoved'
import { MistakesDisclosure } from '@/components/after-session/MistakesDisclosure'
import { XpChip } from '@/components/after-session/XpChip'

const TODAY = '/(tabs)/today'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; summary: SummaryView }

export default function SessionDone() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>()
  const router = useRouter()
  const { space } = useTheme()
  const [state, setState] = useState<State>({ status: 'loading' })
  const finished = useRef<Promise<unknown>>(Promise.resolve())
  const active = useRef(true)

  const toToday = useCallback(() => {
    active.current = false
    router.dismissTo(TODAY)
  }, [router])

  // Android Back leaves the summary for Today instead of returning to the finished session.
  useFocusEffect(useCallback(() => {
    active.current = true
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      toToday()
      return true
    })
    return () => {
      active.current = false
      subscription.remove()
    }
  }, [toToday]))

  useEffect(() => {
    if (!sessionId) return
    const controller = new AbortController()
    setState({ status: 'loading' })
    // Ending is idempotent, so a remount or retry returns the same summary.
    api<SummaryView>(`/sessions/${encodeURIComponent(sessionId)}/end`, { method: 'POST', signal: controller.signal })
      .then((summary) => {
        if (controller.signal.aborted || !active.current) return
        if (summary.total === 0) {
          toToday()
          return
        }
        finished.current = recordFinished(summary.sessionId).catch(() => undefined)
        setState({ status: 'ready', summary })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          status: 'error',
          message: error instanceof ApiError && error.status === null
            ? 'Can’t reach Learn Quiz. Check your connection and try again.'
            : 'Couldn’t wrap up this session.',
        })
      })
    return () => controller.abort()
  }, [sessionId, toToday])

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      {state.status === 'ready' ? (
        <Summary summary={state.summary} finished={finished.current} toToday={toToday} active={active} />
      ) : (
        <Screen
          contentContainerStyle={{ paddingTop: space[4], paddingBottom: space[6], gap: space[8] }}
          dock={state.status === 'error' ? <Button size="lg" onPress={toToday}>Back to Today</Button> : undefined}
        >
          {state.status === 'error' ? <AlertRow>{state.message}</AlertRow> : <Skeleton />}
        </Screen>
      )}
    </>
  )
}

function Skeleton() {
  const { colors, space, radius } = useTheme()
  const block = (width: `${number}%`, minHeight: number) => (
    <View style={{ width, minHeight, borderRadius: radius.md, backgroundColor: colors.surfaceSunken }} />
  )
  return (
    <View style={{ gap: space[8] }}>
      <Text muted accessibilityLiveRegion="polite" accessibilityRole="text">Wrapping up</Text>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: space[8] }}>
        <View style={{ gap: space[2] }}>
          {block('60%', space[8])}
          {block('45%', space[6])}
        </View>
        {block('100%', space[12] + space[4])}
        <View style={{ gap: space[3] }}>
          {block('40%', space[6])}
          {block('100%', space[12])}
          {block('100%', space[12])}
        </View>
      </View>
    </View>
  )
}

function Summary({ summary, finished, toToday, active }: {
  summary: SummaryView
  finished: Promise<unknown>
  toToday: () => void
  active: RefObject<boolean>
}) {
  const router = useRouter()
  const { space } = useTheme()
  const heading = useRef<NativeText>(null)
  const [pending, setPending] = useState(false)
  useHeadingFocus(heading)

  const placed = summary.kind === 'placement' && summary.level !== null
  const streak = streakLabel(summary.streak)
  const coach = placed && summary.levelLine ? summary.levelLine : summary.nextLine

  const onContinue = async () => {
    if (pending || !active.current) return
    setPending(true)
    try {
      await finished
      if (!active.current) return
      const [counts, permission] = await Promise.all([readPromptCounts(), Notifications.getPermissionsAsync()])
      if (!active.current) return
      const prompt = shouldPromptOptIn({
        ...counts,
        permission: permission.status as PushPermission,
        canAskAgain: permission.canAskAgain,
      })
      if (prompt) router.replace('/opt-in')
      else toToday()
    } catch {
      if (active.current) toToday()
    }
  }

  const onAnother = () => {
    if (pending) return
    setPending(true)
    router.replace({ pathname: '/play/loading', params: { topicId: summary.topicId, start: 'session' } })
  }

  return (
    <Screen
      contentContainerStyle={{ paddingTop: space[4], paddingBottom: space[6], gap: space[8] }}
      dock={
        <View style={{ gap: space[1] }}>
          <Button size="lg" busy={pending} onPress={() => { void onContinue() }}>Continue</Button>
          <LinkButton style={{ alignSelf: 'center' }} disabled={pending} onPress={onAnother}>Another session</LinkButton>
        </View>
      }
    >
      <View style={{ gap: space[4] }}>
        <View style={{ gap: space[1] }}>
          <Text ref={heading} variant="title1" header>
            {placed ? `You’re at level ${summary.level} of 5` : 'Session done'}
          </Text>
          <Text variant="bodyLg" muted num>{scoreLine(summary)}</Text>
        </View>
        {!placed && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}>
            <XpChip xp={summary.xp} />
            {streak && <StreakPill count={summary.streak} variant="quiet" popIn accessibilityLabel={streak} />}
          </View>
        )}
        {coach ? <CoachNote>{coach}</CoachNote> : null}
      </View>
      <MasteryMoved rows={summary.masteryMoved} benchmark={summary.benchmark} />
      <MistakesDisclosure mistakes={summary.mistakes} />
    </Screen>
  )
}
