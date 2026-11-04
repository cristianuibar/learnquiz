import { useState, type ReactNode, type Ref } from 'react'
import { Pressable, View } from 'react-native'
import type { UnitRowModel } from '@/lib/path'
import { useTheme } from '@/theme/ThemeProvider'
import { Bar } from '../ui/Bar'
import { Card } from '../ui/Card'
import { Chip } from '../ui/Chip'
import { CriticalIcon } from '../ui/icons'
import { Text } from '../ui/Text'
import { PathNode } from './PathNode'

export type UnitRowProps = {
  row: UnitRowModel
  benchmark: number
  onPress: () => void
  ref?: Ref<View>
}

// One unit: the node on the rail and a tight card. A row is one link whose
// label carries the whole row; its parts are hidden from TalkBack. A locked
// row is inert.
export function UnitRow({ row, benchmark, onPress, ref }: UnitRowProps) {
  const { colors, space, radius, sizes } = useTheme()
  const [focused, setFocused] = useState(false)
  const content = (pressed: boolean) => (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: sizes.target }}
    >
      <PathNode kind={row.kind} number={row.number} />
      <UnitCard row={row} benchmark={benchmark} pressed={pressed} />
    </View>
  )
  return (
    <View style={{ position: 'relative' }}>
      <Rail segment={row.rail} />
      {row.locked ? (
        <View
          ref={ref}
          accessible
          accessibilityLabel={row.label}
          accessibilityState={{ disabled: true }}
        >
          {content(false)}
        </View>
      ) : (
        <Pressable
          ref={ref}
          accessible
          focusable
          accessibilityRole="link"
          accessibilityLabel={row.label}
          onPress={onPress}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            borderRadius: radius.md,
            outlineWidth: focused ? 2 : 0,
            outlineOffset: 2,
            outlineColor: colors.brand,
          }}
        >
          {({ pressed }) => content(pressed)}
        </Pressable>
      )}
    </View>
  )
}

// A 2 px line through the node centres, into the 8 px gap below each row.
function Rail({ segment }: { segment: UnitRowModel['rail'] }) {
  const { colors, space } = useTheme()
  if (!segment) return null
  const gap = -space[2]
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        left: space[4] - 1,
        width: 2,
        top: segment === 'first' ? '50%' : 0,
        bottom: segment === 'last' ? '50%' : gap,
        backgroundColor: colors.border,
      }}
    />
  )
}

function UnitCard({ row, benchmark, pressed }: { row: UnitRowModel; benchmark: number; pressed: boolean }) {
  const { colors, space } = useTheme()
  return (
    <Card variant="tight" style={{ flex: 1, minWidth: 0, gap: space[2], backgroundColor: pressed ? colors.surfaceSunken : colors.surfaceCard }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: space[2], flexShrink: 1, minWidth: 0 }}>
          <Text variant="labelLg" style={{ flexShrink: 1 }}>{row.name}</Text>
          {row.next && <Text variant="caption" style={{ color: colors.brand }}>Next</Text>}
        </View>
        <Text variant="label" num muted={row.percent.muted}>{row.percent.text}</Text>
      </View>
      <Bar accessible={false} value={row.bar.value} estimate={row.bar.estimate} benchmark={benchmark * 100} />
      {row.meta.meta && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: space[2] }}>
          {row.meta.chip && <Chip variant={row.meta.chip} accessible={false} />}
          {row.meta.critical && <CriticalTag>{row.meta.critical}</CriticalTag>}
        </View>
      )}
    </Card>
  )
}

function CriticalTag({ children }: { children: ReactNode }) {
  const { colors, space } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
      <CriticalIcon size={space[4]} color={colors.ink} />
      <Text variant="chip" num>{children}</Text>
    </View>
  )
}
