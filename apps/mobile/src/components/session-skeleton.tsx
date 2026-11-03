import { View } from 'react-native'
import { useTheme } from '../theme/ThemeProvider'

export function SessionSkeleton() {
  const { colors, space, radius, sizes } = useTheme()

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ gap: space[6] }}
    >
      <View style={{ gap: space[2] }}>
        <View style={{ minHeight: space[6], width: '92%', backgroundColor: colors.surfaceSunken, borderRadius: radius.md }} />
        <View style={{ minHeight: space[6], width: '64%', backgroundColor: colors.surfaceSunken, borderRadius: radius.md }} />
      </View>
      <View style={{ gap: space[3] }}>
        <View style={{ minHeight: sizes.topbarH, width: '100%', backgroundColor: colors.surfaceSunken, borderRadius: radius.md }} />
        <View style={{ minHeight: sizes.topbarH, width: '100%', backgroundColor: colors.surfaceSunken, borderRadius: radius.md }} />
        <View style={{ minHeight: sizes.topbarH, width: '100%', backgroundColor: colors.surfaceSunken, borderRadius: radius.md }} />
        <View style={{ minHeight: sizes.topbarH, width: '100%', backgroundColor: colors.surfaceSunken, borderRadius: radius.md }} />
      </View>
    </View>
  )
}
