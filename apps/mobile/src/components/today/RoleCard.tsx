import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import type { TodayRoleView } from '@learnquiz/api/today'
import { useTheme } from '@/theme/ThemeProvider'
import { Bar } from '../ui/Bar'
import { Chip } from '../ui/Chip'
import { Text } from '../ui/Text'

export type RoleCardProps = { role: TodayRoleView; onPress: () => void }

export function RoleCard({ role, onPress }: RoleCardProps) {
  const { colors, space, radius, sizes } = useTheme()
  const [focused, setFocused] = useState(false)
  return (
    <Pressable
      accessible
      focusable
      accessibilityRole="link"
      accessibilityLabel={role.accessibleLabel}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.surfaceSunken : colors.surfaceCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        padding: space[4],
        minHeight: sizes.target,
        outlineWidth: focused ? 2 : 0,
        outlineOffset: 2,
        outlineColor: colors.brand,
      })}
    >
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ gap: space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Text variant="label" style={{ flex: 1 }}>{role.name}</Text>
          <ChevronRight size={space[6] - space[1]} color={colors.inkMuted} strokeWidth={2} accessible={false} />
        </View>
        <Bar accessible={false} value={role.started ? role.pct ?? 0 : 0} benchmark={role.benchmarkPct} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', minHeight: space[6] + space[1], gap: space[2] }}>
          {role.chip ? <Chip variant="none" accessible={false} style={{ maxWidth: '100%' }}>{role.chip}</Chip> : <Text variant="label" num style={{ maxWidth: '100%', flexShrink: 1 }}>{role.progressLabel}</Text>}
          <Text variant="caption" muted num style={{ maxWidth: '100%', flexShrink: 1 }}>{role.dayLabel}</Text>
        </View>
      </View>
    </Pressable>
  )
}
