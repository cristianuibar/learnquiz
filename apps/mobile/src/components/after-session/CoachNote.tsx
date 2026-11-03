import { View } from 'react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { Mark } from '../ui/Mark'
import { Text } from '../ui/Text'

export function CoachNote({ children }: { children: string }) {
  const { colors, space, radius } = useTheme()
  return (
    <View
      accessible
      accessibilityLabel={`Coach note. ${children}`}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space[3],
        backgroundColor: colors.surfaceSunken,
        borderRadius: radius.md,
        paddingVertical: space[3],
        paddingHorizontal: space[4],
      }}
    >
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ marginTop: 1 }}>
        <Mark size={20} />
      </View>
      <Text variant="body" style={{ flex: 1 }}>{children}</Text>
    </View>
  )
}
