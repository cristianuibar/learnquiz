import { View, type ViewProps } from 'react-native'
import type { space } from '@learnquiz/tokens/native'
import { useTheme } from '../../theme/ThemeProvider'

export type CardProps = ViewProps & {
  variant?: 'default' | 'tight'
  padding?: keyof typeof space
  paddingHorizontal?: keyof typeof space
  paddingVertical?: keyof typeof space
}

export function Card({ variant = 'default', padding, paddingHorizontal, paddingVertical, style, ...props }: CardProps) {
  const { colors, space, radius } = useTheme()
  return (
    <View {...props} style={[{
      backgroundColor: colors.surfaceCard,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: space[paddingHorizontal ?? padding ?? 4],
      paddingVertical: space[paddingVertical ?? padding ?? (variant === 'tight' ? 3 : 4)],
    }, style]} />
  )
}
