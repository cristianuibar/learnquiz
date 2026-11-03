import Svg, { Circle, Path } from 'react-native-svg'
import type { LucideProps } from 'lucide-react-native'
import { useTheme } from '../../theme/ThemeProvider'

export function StreakIcon({ size, color, ...props }: LucideProps) {
  const { colors, space } = useTheme()
  return (
    <Svg width={size ?? space[6]} height={size ?? space[6]} color={color ?? colors.ink} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" accessible={false} {...props}>
      <Path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </Svg>
  )
}

export function StillLearningIcon({ size, color, ...props }: LucideProps) {
  const { colors, space } = useTheme()
  return (
    <Svg width={size ?? space[6]} height={size ?? space[6]} color={color ?? colors.ink} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" accessible={false} {...props}>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
    </Svg>
  )
}

export function CriticalIcon({ size, color, ...props }: LucideProps) {
  const { colors, space } = useTheme()
  return (
    <Svg width={size ?? space[6]} height={size ?? space[6]} color={color ?? colors.ink} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" accessible={false} {...props}>
      <Path d="M12 3l7 3v5c0 4.6-3 8.3-7 10-4-1.7-7-5.4-7-10V6z" />
      <Circle cx="12" cy="11.5" r="1.5" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function RetryIcon({ size, color, ...props }: LucideProps) {
  const { colors, space } = useTheme()
  return (
    <Svg width={size ?? space[6]} height={size ?? space[6]} color={color ?? colors.ink} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" accessible={false} {...props}>
      <Path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
    </Svg>
  )
}
