import { useRef, useState } from 'react'
import { AccessibilityInfo, findNodeHandle, Pressable, View } from 'react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { clearSteps, ORDER_CAPTION, orderRows, positionOf, stepAnnouncement, toggleStep } from '../../lib/session/order'
import { Button } from '../ui/Button'
import { Text } from '../ui/Text'
import { DiagramImage } from './diagram-image'
import type { QuestionBodyProps } from './types'

export function OrderBody({ item, answer, onAnswer, marks, disabled }: QuestionBodyProps) {
  const { colors, space, radius, sizes } = useTheme()
  const refs = useRef<(View | null)[]>([])
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const order = answer.order ?? []
  const rows = orderRows(item.options, order, marks, disabled)
  const locked = disabled || marks !== null
  const showClear = order.length > 0 && !locked
  const badge = space[6] + space[1]

  function press(id: string, text: string) {
    const next = toggleStep(order, id)
    onAnswer({ order: next })
    AccessibilityInfo.announceForAccessibility(stepAnnouncement(text, positionOf(next, id), item.options.length))
  }

  function clear() {
    onAnswer({ order: clearSteps() })
    requestAnimationFrame(() => {
      const first = refs.current[0]
      const tag = first && findNodeHandle(first)
      if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag)
      ;(first as (View & { focus?: () => void }) | null)?.focus?.()
    })
  }

  return (
    <View style={{ gap: space[3] }}>
      {item.image && <DiagramImage image={item.image} />}
      <View style={{ gap: space[4] }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="caption" muted style={{ flex: 1 }}>{ORDER_CAPTION}</Text>
          {/* Clear is always laid out so the row keeps its scaled height; it is hidden until a step is placed.
              borderWidth 0 drops the disabled border, so hidden and shown Clear have the same box. */}
          <View
            pointerEvents={showClear ? 'auto' : 'none'}
            accessibilityElementsHidden={!showClear}
            importantForAccessibility={showClear ? 'auto' : 'no-hide-descendants'}
            style={{ opacity: showClear ? 1 : 0, marginRight: -space[4] }}
          >
            <Button variant="ghost" onPress={clear} disabled={!showClear} style={{ borderWidth: 0 }}>Clear</Button>
          </View>
        </View>
        <View accessible={false} accessibilityLabel={item.stem} style={{ gap: space[3] }}>
          {rows.map((row, index) => {
            const placed = row.position != null
            const focused = focusedId === row.id
            return (
              <Pressable
                key={row.id}
                ref={(ref) => { refs.current[index] = ref }}
                accessible
                accessibilityRole="button"
                accessibilityLabel={row.label}
                accessibilityState={{ disabled: row.disabled }}
                disabled={row.disabled}
                focusable={!row.disabled}
                onFocus={() => setFocusedId(row.id)}
                onBlur={() => setFocusedId((current) => (current === row.id ? null : current))}
                onPress={() => press(row.id, row.text)}
                style={({ pressed }) => ({
                  minHeight: sizes.topbarH,
                  paddingVertical: space[3],
                  paddingHorizontal: space[4],
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[3],
                  borderWidth: 2,
                  borderRadius: radius.md,
                  borderColor: placed ? colors.brand : colors.borderStrong,
                  backgroundColor: pressed ? colors.surfaceSunken : placed ? colors.brandTint : colors.surfaceCard,
                  outlineWidth: focused ? 2 : 0,
                  outlineOffset: 2,
                  outlineColor: colors.brand,
                })}
              >
                <View
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                  accessibilityElementsHidden
                  style={{
                    width: badge,
                    height: badge,
                    borderRadius: radius.full,
                    borderWidth: 2,
                    borderStyle: placed ? 'solid' : 'dashed',
                    borderColor: placed ? colors.brand : colors.borderStrong,
                    backgroundColor: placed ? colors.brand : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {placed && <Text variant="label" num style={{ color: colors.onBrand }}>{row.position}</Text>}
                </View>
                <Text variant="bodyLg" style={{ flex: 1 }}>{row.text}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>
    </View>
  )
}
