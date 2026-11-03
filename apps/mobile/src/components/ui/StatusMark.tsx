import { View, type ViewProps } from 'react-native'
import { Check } from 'lucide-react-native'
import Svg, { Circle } from 'react-native-svg'
import { useTheme } from '../../theme/ThemeProvider'

export type StatusMarkProps = ViewProps & { done?: boolean }

export function StatusMark({ done = false, accessible = true, style, ...props }: StatusMarkProps) {
  const { colors, space, radius } = useTheme()
  return (
    <View
      {...props}
      accessible={accessible}
      focusable={false}
      accessibilityRole={accessible ? 'image' : undefined}
      accessibilityLabel={accessible ? (done ? 'Done' : 'Not done') : undefined}
      accessibilityElementsHidden={!accessible}
      importantForAccessibility={accessible ? 'auto' : 'no-hide-descendants'}
      style={[{
        width: space[4] + space[1],
        height: space[4] + space[1],
        borderRadius: radius.full,
        backgroundColor: done ? colors.brandTint : undefined,
        alignItems: 'center',
        justifyContent: 'center',
      }, style]}
    >
      {done ? (
        <Check size={space[4]} color={colors.brand} strokeWidth={2} accessible={false} />
      ) : (
        <Svg width="100%" height="100%" viewBox="0 0 24 24" strokeLinecap="round" accessible={false}>
          <Circle cx="12" cy="12" r="9" fill="none" stroke={colors.inkMuted} strokeWidth={2} strokeDasharray="2 5.07" />
        </Svg>
      )}
    </View>
  )
}
