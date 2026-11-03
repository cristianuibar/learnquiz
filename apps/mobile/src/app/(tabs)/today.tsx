import { useCallback, useRef } from 'react'
import { AccessibilityInfo, findNodeHandle, ScrollView, View, type Text as NativeText } from 'react-native'
import { useFocusEffect, useRouter, useScrollToTop } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { EmptyState } from '@/components/today/EmptyState'
import { Hero } from '@/components/today/Hero'
import { QuestCard } from '@/components/today/QuestCard'
import { RoleCard } from '@/components/today/RoleCard'
import { TodayTopBar } from '@/components/today/TodayTopBar'
import { signOut } from '@/lib/auth'
import { PLAY_LOADING, playParams, useStreakPop, useToday } from '@/lib/today'
import { useTheme } from '@/theme/ThemeProvider'

export default function TodayScreen() {
  const { today, view, refresh } = useToday()
  const { colors, space } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const heading = useRef<NativeText>(null)
  const scroll = useRef<ScrollView>(null)
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

  const reward = view?.hero.kind === 'done'
  const popIn = useStreakPop(reward)

  const play = useCallback(() => {
    const params = playParams(today)
    if (params) router.push({ pathname: PLAY_LOADING, params })
  }, [today, router])
  const openProfile = useCallback(() => router.navigate('/(tabs)/profile'), [router])

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
        {!view ? (
          <Skeleton />
        ) : view.hero.kind === 'empty' ? (
          <EmptyState onRetry={() => { void refresh() }} onSignOut={() => { void signOut() }} />
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
