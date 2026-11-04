import type { RefObject } from 'react'
import { View, type Text as NativeText } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { TodayStreak } from '@learnquiz/api/today'
import { mediaSource } from '@/lib/api'
import { useSession } from '@/lib/session-store'
import { useTheme } from '@/theme/ThemeProvider'
import { Mark } from '../ui/Mark'
import { OrgLogo } from '../ui/OrgLogo'
import { StreakPill } from '../ui/StreakPill'
import { Text } from '../ui/Text'

export type TodayTopBarProps = {
  streak: TodayStreak | null
  streakCount: number
  reward: boolean
  popIn: boolean
  headingRef: RefObject<NativeText | null>
}

export function TodayTopBar({ streak, streakCount, reward, popIn, headingRef }: TodayTopBarProps) {
  const { colors, space, sizes } = useTheme()
  const insets = useSafeAreaInsets()
  const { branding, user } = useSession()
  const branded = branding !== null && !user?.isAnonymous

  return (
    <View style={{
      paddingTop: insets.top,
      minHeight: sizes.topbarH + insets.top,
      paddingHorizontal: space[4],
      backgroundColor: colors.surfacePage,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space[3],
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], flexShrink: 1 }}>
        {branded ? (
          <>
            <OrgLogo name={branding.name} size={32} source={branding.logoUrl ? mediaSource(branding.logoUrl) : undefined} />
            <Text variant="label" numberOfLines={1} ellipsizeMode="tail" style={{ flexShrink: 1 }}>{branding.name}</Text>
          </>
        ) : (
          <>
            <Mark size={space[8]} />
            <Text variant="label" numberOfLines={1} ellipsizeMode="tail" style={{ flexShrink: 1 }}>Learn Quiz</Text>
          </>
        )}
      </View>
      {/* Visually hidden but still visible to TalkBack, which skips views with zero opacity. */}
      <Text ref={headingRef} header variant="label" style={{ position: 'absolute', left: 0, top: insets.top, width: 1, height: 1, overflow: 'hidden', color: colors.surfacePage }}>Today</Text>
      {streak && (
        <StreakPill
          key={reward ? 'reward' : 'quiet'}
          count={streakCount}
          iconSize={space[4] + space[1]}
          variant={reward ? 'reward' : 'quiet'}
          popIn={reward && popIn}
          accessibilityLabel={streak.label}
        />
      )}
    </View>
  )
}
