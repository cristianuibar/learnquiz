import { useCallback, useRef, useState } from 'react'
import { AccessibilityInfo, findNodeHandle, Pressable, View, type Text as NativeText } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { ChevronRight } from 'lucide-react-native'
import type { Profile as ProfileData } from '@learnquiz/api/progress'
import type { Today } from '@learnquiz/api/today'
import { MasteryCard } from '@/components/profile/MasteryCard'
import { ProfileEmpty } from '@/components/profile/ProfileEmpty'
import { ProfileHeader } from '@/components/profile/ProfileHeader'
import { WeeklyTrend } from '@/components/profile/WeeklyTrend'
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
}

export default function Profile() {
  const { colors, space, sizes } = useTheme()
  const router = useRouter()
  const { user, status: sessionStatus } = useSession()
  const token = getToken()
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<ProgressState>({ owner: null, profile: null, play: null, status: 'loading' })
  // Hide a previous token's payload even before the focus effect cleans up.
  const current = state.owner === token && sessionStatus === 'ready'
  const profile = current ? state.profile : null
  const status = current ? state.status : 'loading'
  const settingsRef = useRef<View | null>(null)
  const returningFromSettings = useRef(false)
  const headingRef = useRef<NativeText | null>(null)
  // A tab screen stays mounted, so focus the heading on every arrival (for
  // example from the Today role card), not only on the first mount.
  useFocusEffect(useCallback(() => {
    const frame = requestAnimationFrame(() => {
      const target = returningFromSettings.current ? settingsRef.current : headingRef.current
      returningFromSettings.current = false
      const tag = target && findNodeHandle(target)
      if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag)
    })
    return () => cancelAnimationFrame(frame)
  }, []))

  // Tabs stay mounted. Refetch on each arrival and discard responses after
  // blur, retry or token replacement; the session store owns auth routing.
  useFocusEffect(useCallback(() => {
    if (!token || sessionStatus !== 'ready') return
    const controller = new AbortController()
    const active = () => !controller.signal.aborted && getToken() === token
    setState({ owner: token, profile: null, play: null, status: 'loading' })
    void (async () => {
      let next: ProfileData | null = null
      try {
        next = await api<ProfileData>('/me/profile', { signal: controller.signal })
        if (!active()) return
        // The Loading route owns session creation; only Today's confirmed
        // topic and plan.start are passed to it, including placement starts.
        const today = next.started ? null : await api<Today>('/today', { signal: controller.signal })
        if (active()) setState({ owner: token, profile: next, play: firstSessionParams(today), status: 'ready' })
      } catch (error) {
        if (!active() || (error instanceof ApiError && error.status === 401)) return
        setState({ owner: token, profile: next, play: null, status: 'error' })
      }
    })()
    return () => controller.abort()
  }, [token, sessionStatus, attempt]))
  const [focused, setFocused] = useState(false)
  const [busy, setBusy] = useState(false)

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
        <Button size="lg" disabled={status !== 'ready' || !state.play} onPress={() => {
          if (state.play && state.owner === getToken()) router.push({ pathname: '/play/loading', params: state.play })
        }}>Play first session</Button>
      ) : undefined}>
      <ProfileHeader name={profile?.name ?? user?.name ?? null} role={profile?.role ?? null}
        headingRef={headingRef} settingsRef={settingsRef} onSettings={() => {
          returningFromSettings.current = true
          router.push('/settings')
        }} />
      {status === 'loading' ? <Skeleton /> : (
        <>
          {status === 'error' && (
            <View style={{ gap: space[3] }}>
              <AlertRow>Could not load training progress.</AlertRow>
              <Button variant="secondary" onPress={() => setAttempt((value) => value + 1)}>Try again</Button>
            </View>
          )}
          {profile && (profile.started ? (
            <>
              <MasteryCard profile={profile} />
              <WeeklyTrend profile={profile} />
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
