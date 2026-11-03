import { View, type ViewProps } from 'react-native'
import { Info } from 'lucide-react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { Text } from './Text'

export function AlertRow({ children, style, ...props }: ViewProps) {
  const { colors, space, radius } = useTheme()
  return (
    <View {...props} accessible accessibilityRole="alert" accessibilityLiveRegion="assertive" style={[{ flexDirection: 'row', alignItems: 'flex-start', gap: space[3], padding: space[4], borderRadius: radius.md, backgroundColor: colors.surfaceSunken }, style]}>
      <Info size={space[6] - space[1]} strokeWidth={2} color={colors.ink} accessible={false} />
      <Text style={{ flex: 1 }}>{children}</Text>
    </View>
  )
}
