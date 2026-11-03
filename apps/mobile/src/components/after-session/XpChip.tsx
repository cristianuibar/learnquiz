import { View, type ViewProps } from 'react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { Text } from '../ui/Text'

export function XpChip({ xp, style, ...viewProps }: ViewProps & { xp: number }) {
  const { colors, space, radius } = useTheme()
  return (
    <View
      {...viewProps}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`+${xp} XP`}
      style={[{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: space[8],
        paddingVertical: space[1],
        paddingHorizontal: space[3],
        borderRadius: radius.full,
        backgroundColor: colors.accent,
      }, style]}
    >
      <Text variant="label" num style={{ color: colors.onAccent, fontWeight: '700' }}>{`+${xp} XP`}</Text>
    </View>
  )
}
