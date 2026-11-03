import { useId } from 'react'
import { View } from 'react-native'
import Svg, { Defs, Mask, Rect } from 'react-native-svg'
import { useTheme } from '../../theme/ThemeProvider'
import { Mark } from '../ui/Mark'
import { Text } from '../ui/Text'

// The OS-colored notification card from the OptIn artboard. One accessible
// image; the inner rows stay hidden from TalkBack.
export function OptInPreview({ stem }: { stem: string }) {
  const { colors, space, radius, typography } = useTheme()
  const markId = useId()
  const badgeSize = space[4] + space[1]
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Preview of a notification from Learn Quiz: ${stem}`}
      style={{
        backgroundColor: colors.osCard,
        borderRadius: radius.lg,
        padding: space[4],
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ gap: space[2] }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <View
            style={{
              width: badgeSize,
              height: badgeSize,
              borderRadius: radius.full,
              backgroundColor: colors.brand,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Svg width={space[4]} height={space[4]} accessible={false}>
              <Defs>
                <Mask id={markId} x="0" y="0" width={space[4]} height={space[4]} maskUnits="userSpaceOnUse" maskType="alpha">
                  <Mark size={space[4]} />
                </Mask>
              </Defs>
              <Rect width={space[4]} height={space[4]} fill={colors.onBrand} mask={`url(#${markId})`} />
            </Svg>
          </View>
          <Text variant="caption" style={{ color: colors.osInkMuted }}>
            Learn Quiz · now
          </Text>
        </View>
        <Text
          variant="body"
          style={{ color: colors.osInk, fontFamily: typography.title2.fontFamily }}
        >
          {stem}
        </Text>
      </View>
    </View>
  )
}
