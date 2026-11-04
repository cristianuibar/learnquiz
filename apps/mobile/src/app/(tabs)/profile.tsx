import { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, findNodeHandle, Pressable, View, type Text as NativeText } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { ChevronRight } from 'lucide-react-native'
import type { Profile as ProfileData } from '@learnquiz/api/progress'
import type { Today } from '@learnquiz/api/today'
import { MasteryCard } from '@/components/profile/MasteryCard'
import { CriticalSteps } from '@/components/profile/CriticalSteps'
import { ProfileEmpty } from '@/components/profile/ProfileEmpty'
import { ProfileHeader } from '@/components/profile/ProfileHeader'
import { WeeklyTrend } from '@/components/profile/WeeklyTrend'
import { UnitAccordion } from '@/components/profile/UnitAccordion'
import { AlertRow } from '@/components/ui/AlertRow'
import { Button } from '@/components/ui/Button'
import { Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { endSession, useSession } from '@/lib/session-store'
import { api, ApiError } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { firstSessionParams } from '@/lib/profile-progress'
import { useTheme } from '@/theme/ThemeProvider'

type ProgressState = {
  owner: string | null
  profile: ProfileData | null
  play: ReturnType<typeof firstSessionParams>
  status: 'loading' | 'ready' | 'error'
  error: 'profile' | 'session' | null
}

export default function Profile() {
  const { colors, space, sizes } = useTheme()
  const router = useRouter()
  const { user, status: sessionStatus } = useSession()
  const token = getToken()
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<ProgressState>({ owner: null, profile: null, play: null, status: 'loading', error: null })
  // Hide a previous token's payload even before the focus effect cleans up.
  const current = state.owner === token && sessionStatus === 'ready'
  const profile = current ? state.profile : null
  const status = current ? state.status : 'loading'
  const error = current ? state.error : null
  const settingsRef = useRef<View | null>(null)
  const returningFromSettings = useRef(false)
  const headingRef = useRef<NativeText | null>(null)
  const retryRef = useRef<View | null>(null)
  const retryHadFocus = useRef(false)
  const retryStartedWithFocus = useRef(false)
  const prevStatus = useRef(status)

  // A successful retry removes its control. Preserve focus ownership while
  // busy disables it, then return TalkBack to the stable screen heading. A retry
  // that fails again (for example the profile loads and then Today fails) may
  // replace the page Try again with the dock's, so focus the Try again on screen.
  useEffect(() => {
    const was = prevStatus.current
    prevStatus.current = status
    const owned = retryHadFocus.current || retryStartedWithFocus.current
    if (was === 'loading' && status !== 'loading' && owned) {
      retryHadFocus.current = false
      retryStartedWithFocus.current = false
      const target = status === 'ready' ? headingRef.current : retryRef.current
      const tag = target && findNodeHandle(target)
      if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag)
    }
    if (status !== 'loading') retryStartedWithFocus.current = false
  }, [status])
  // A tab screen stays mounted, so focus the heading on every arrival (for
  // example from the Today role card), not only on the first mount.
  useFocusEffect(useCallback(() => {
    const frame = requestAnimationFrame(() => {
      const target = returningFromSettings.current ? settingsRef.current : headingRef.current
      returningFromSettings.current = false
      const tag = target && findNodeHandle(target)
      if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag)
    })
    return () => {
      cancelAnimationFrame(frame)
      retryHadFocus.current = false
      retryStartedWithFocus.current = false
    }
  }, []))

  // Tabs stay mounted. Refetch on each arrival and discard responses after
  // blur, retry or token replacement; the session store owns auth routing.
  useFocusEffect(useCallback(() => {
    if (!token || sessionStatus !== 'ready') return
    const controller = new AbortController()
    const active = () => !controller.signal.aborted && getToken() === token
    setState((previous) => ({
      owner: token,
      profile: previous.owner === token ? previous.profile : null,
      play: null,
      status: 'loading',
      error: previous.owner === token ? previous.error : null,
    }))
    void (async () => {
      let next: ProfileData | null = null
      try {
        next = await api<ProfileData>('/me/profile', { signal: controller.signal })
        if (!active()) return
        const loaded = next
        setState((previous) => ({
          ...previous,
          profile: loaded,
          error: previous.error === 'session' && !loaded.started ? 'session' : null,
        }))
        // The Loading route owns session creation; only Today's confirmed
        // topic and plan.start are passed to it, including placement starts.
        const today = next.started ? null : await api<Today>('/today', { signal: controller.signal })
        if (active()) setState({ owner: token, profile: next, play: firstSessionParams(today), status: 'ready', error: null })
      } catch (error) {
        if (!active() || (error instanceof ApiError && error.status === 401)) return
        setState((previous) => ({
          owner: token,
          profile: next ?? (previous.owner === token ? previous.profile : null),
          play: null,
          status: 'error',
          error: next ? 'session' : 'profile',
        }))
      }
    })()
    return () => controller.abort()
  }, [token, sessionStatus, attempt]))
  const [focused, setFocused] = useState(false)
  const [busy, setBusy] = useState(false)
  const retry = () => {
    retryStartedWithFocus.current = true
    setAttempt((value) => value + 1)
  }
  const retryButton = (
    <Button ref={retryRef} variant="secondary" busy={status === 'loading'} onPress={retry}
      onFocus={() => { retryHadFocus.current = true }} onBlur={() => { retryHadFocus.current = false }}>
      Try again
    </Button>
  )

  const handleSignOut = async () => {
    if (busy) return
    setBusy(true)
    // endSession() never rejects and always drops the session, so the route guard
    // alone moves the learner to sign-in, even when cleanup or push unregistration fails.
    try {
      await endSession()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen contentContainerStyle={{ paddingTop: space[2], paddingBottom: space[8] }}
      dock={profile && !profile.started ? (
        error === 'session' ? (
          <>
            <Text muted accessibilityLiveRegion="polite">Could not load the first session.</Text>
            {retryButton}
          </>
        ) : (
          <Button size="lg" disabled={status !== 'ready' || !state.play} onPress={() => {
            if (state.play && state.owner === getToken()) router.push({ pathname: '/play/loading', params: state.play })
          }}>Play first session</Button>
        )
      ) : undefined}>
      <ProfileHeader name={profile?.name ?? user?.name ?? null} role={profile?.role ?? null}
        headingRef={headingRef} settingsRef={settingsRef} onSettings={() => {
          returningFromSettings.current = true
          router.push('/settings')
        }} />
      {error === 'profile' && (
        <View style={{ gap: space[3] }}>
          <AlertRow>Could not load training progress.</AlertRow>
          {retryButton}
        </View>
      )}
      {!profile && status === 'loading' ? <Skeleton /> : (
        <>
          {profile && (profile.started ? (
            <>
              <MasteryCard profile={profile} />
              <WeeklyTrend profile={profile} />
              <UnitAccordion units={profile.units} benchmark={profile.benchmark} />
              <CriticalSteps confidentErrors={profile.confidentErrors} />
            </>
          ) : <ProfileEmpty profile={profile} />)}
        </>
      )}
      <View style={{ gap: space[1] }}>
        <Text header variant="title3">
          Account
        </Text>
        <Pressable
          accessible
          focusable
          accessibilityRole="link"
          accessibilityLabel="What we record"
          onPress={() => router.push({ pathname: '/welcome', params: { review: '1' } })}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={({ pressed }) => ({
            minHeight: sizes.topbarH,
            paddingVertical: space[3],
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[3],
            backgroundColor: pressed ? colors.surfaceSunken : 'transparent',
            outlineWidth: focused ? 2 : 0,
            outlineOffset: 2,
            outlineColor: colors.brand,
          })}
        >
          <Text variant="bodyLg" style={{ flex: 1 }} importantForAccessibility="no">
            What we record
          </Text>
          <ChevronRight size={space[6]} color={colors.inkMuted} strokeWidth={2} accessible={false} />
        </Pressable>
        <View style={{ paddingTop: space[3] }}>
          <Button variant="secondary" busy={busy} onPress={handleSignOut}>
            Sign out
          </Button>
        </View>
      </View>
    </Screen>
  )
}

function Skeleton() {
  const { colors, space, radius, sizes } = useTheme()
  const block = { backgroundColor: colors.surfaceSunken, borderRadius: radius.md }
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: space[6] }}>
      <View style={[block, { height: sizes.topbarH * 3 }]} />
      <View style={[block, { height: sizes.topbarH * 4 }]} />
    </View>
  )
}
