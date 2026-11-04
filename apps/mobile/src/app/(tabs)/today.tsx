import { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, findNodeHandle, ScrollView, View, type Text as NativeText } from 'react-native'
import { useFocusEffect, useRouter, useScrollToTop } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { EmptyState } from '@/components/today/EmptyState'
import { Hero } from '@/components/today/Hero'
import { OfflineLead, TodayNotice } from '@/components/today/Notice'
import { QuestCard } from '@/components/today/QuestCard'
import { RoleCard } from '@/components/today/RoleCard'
import { TodayTopBar } from '@/components/today/TodayTopBar'
import { endSession, useSession } from '@/lib/session-store'
import { PLAY_LOADING, playParams, useStreakPop, useToday } from '@/lib/today'
import { useTheme } from '@/theme/ThemeProvider'

export default function TodayScreen() {
  const { companyMember } = useSession()
  const { today, view, status, refreshing, refresh } = useToday({ monitorConnectivity: true })
  const { colors, space } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const heading = useRef<NativeText>(null)
  const scroll = useRef<ScrollView>(null)
  const [retrying, setRetrying] = useState(false)
  const retryHadFocus = useRef(false)
  const retryStartedWithFocus = useRef(false)
  const prevStatus = useRef(status)
  useScrollToTop(scroll)

  // Focus the hidden "Today" header on arrival and on every return to the tab,
  // for example after a session.
  useFocusEffect(useCallback(() => {
    const frame = requestAnimationFrame(() => {
      const tag = heading.current && findNodeHandle(heading.current)
      if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag)
    })
    return () => cancelAnimationFrame(frame)
  }, []))

  // After a retry-driven recovery, the notice unmounts and focus would be
  // lost: move it to the hidden heading. Passive recovery (foreground or poll
  // refetch with retry never focused) leaves focus alone.
  useEffect(() => {
    const was = prevStatus.current
    prevStatus.current = status
    if (was !== 'ready' && status === 'ready' && (retryHadFocus.current || retryStartedWithFocus.current)) {
      retryHadFocus.current = false
      retryStartedWithFocus.current = false
      const tag = heading.current && findNodeHandle(heading.current)
      if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag)
    }
    if (!refreshing) retryStartedWithFocus.current = false
  }, [status, refreshing])

  // A cached done plan stays quiet until the network confirms the reward.
  const reward = view?.streakReward === true && status === 'ready'
  const popIn = useStreakPop(reward)

  const play = useCallback(() => {
    const params = playParams(today, status)
    if (params) router.push({ pathname: PLAY_LOADING, params })
  }, [today, status, router])
  const openProfile = useCallback(() => router.navigate('/(tabs)/profile'), [router])
  const retry = useCallback(() => {
    // Activating either retry owns focus; busy may blur it before success.
    retryStartedWithFocus.current = true
    setRetrying(true)
    void refresh().finally(() => { setRetrying(false) })
  }, [refresh])

  const notice = status === 'offline' || status === 'error'

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfacePage, paddingLeft: insets.left, paddingRight: insets.right }}>
      <TodayTopBar
        streak={view?.streak ?? null}
        streakCount={today?.topic?.streak ?? 0}
        reward={reward}
        popIn={popIn}
        headingRef={heading}
      />
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: space[2], paddingHorizontal: space[4], paddingBottom: space[6], gap: space[6] }}
      >
        {notice && (
          <TodayNotice
            status={status}
            refreshing={retrying}
            onRetry={retry}
            onRetryFocus={() => { retryHadFocus.current = true }}
            onRetryBlur={() => { retryHadFocus.current = false }}
          />
        )}
        {!view ? (
          <Skeleton />
        ) : view.hero.kind === 'empty' ? (
          <EmptyState companyMember={companyMember === true} onRetry={notice ? undefined : retry} onSignOut={() => { void endSession() }} />
        ) : status === 'offline' ? (
          <>
            <OfflineLead hero={view.hero} onPlay={play} />
            <QuestCard quests={view.quests} />
            {view.role && <RoleCard role={view.role} onPress={openProfile} />}
          </>
        ) : (
          <>
            <Hero hero={view.hero} onPlay={play} />
            <QuestCard quests={view.quests} />
            {view.role && <RoleCard role={view.role} onPress={openProfile} />}
          </>
        )}
      </ScrollView>
    </View>
  )
}

// First load without data: two blocks for the lead, one for the quest and one
// for the role card. Static and hidden from TalkBack.
function Skeleton() {
  const { colors, space, radius, sizes } = useTheme()
  const block = { backgroundColor: colors.surfaceSunken, borderRadius: radius.md }
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: space[6] }}>
      <View style={{ gap: space[3] }}>
        <View style={[block, { height: space[8] * 3 }]} />
        <View style={[block, { height: sizes.topbarH }]} />
      </View>
      <View style={[block, { height: sizes.topbarH * 2 }]} />
      <View style={[block, { height: space[12] * 2 }]} />
    </View>
  )
}
