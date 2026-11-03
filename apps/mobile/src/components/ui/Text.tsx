import { Text as NativeText, type TextProps as NativeTextProps } from 'react-native'
import { useTheme } from '../../theme/ThemeProvider'

export type TextProps = NativeTextProps & {
  ref?: React.Ref<NativeText>
  variant?: 'display' | 'title1' | 'title2' | 'title3' | 'bodyLg' | 'body' | 'label' | 'labelLg' | 'caption' | 'overline' | 'chip'
  num?: boolean
  muted?: boolean
  header?: boolean
}

export function Text({ variant = 'body', num, muted, header, style, ...props }: TextProps) {
  const { colors, typography } = useTheme()
  return (
    <NativeText
      {...props}
      accessibilityRole={header ? 'header' : props.accessibilityRole}
      style={[typography[variant], { color: muted ? colors.inkMuted : colors.ink }, num && { fontVariant: ['tabular-nums'] }, style]}
    />
  )
}
