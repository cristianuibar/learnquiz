import { View } from 'react-native'
import { Check, Lock } from 'lucide-react-native'
import type { NodeKind } from '@/lib/path'
import { useTheme } from '@/theme/ThemeProvider'
import { Text } from '../ui/Text'

export type PathNodeProps = { kind: NodeKind; number: number }

// The unit marker on the rail: a 32 circle that carries the unit's kind only.
// Hidden from TalkBack; the row's label says it all.
export function PathNode({ kind, number }: PathNodeProps) {
  const { colors, space, radius } = useTheme()
  const size = space[8]
  const ring = kind === 'next' || kind === 'learning' || kind === 'estimate' || kind === 'not_started'
  const color = kind === 'next' || kind === 'mastered' ? colors.brand : kind === 'locked' ? colors.inkMuted : colors.ink
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        // At least 32; a large font scale grows the circle instead of clipping the number.
        minWidth: size,
        minHeight: size,
        aspectRatio: 1,
        flexShrink: 0,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: ring ? 2 : 0,
        borderStyle: kind === 'estimate' ? 'dashed' : kind === 'not_started' ? 'dotted' : 'solid',
        borderColor: kind === 'next' ? colors.brand : colors.borderStrong,
        backgroundColor: kind === 'mastered' ? colors.brandTint : kind === 'locked' ? colors.surfaceSunken : colors.surfacePage,
      }}
    >
      {kind === 'mastered' ? (
        <Check size={space[4]} color={color} strokeWidth={2} accessible={false} />
      ) : kind === 'locked' ? (
        <Lock size={space[4]} color={color} strokeWidth={2} accessible={false} />
      ) : (
        <Text variant="label" num style={{ color }}>{number}</Text>
      )}
    </View>
  )
}
