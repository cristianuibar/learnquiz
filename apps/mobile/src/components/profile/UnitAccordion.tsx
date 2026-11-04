import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { ChevronDown } from 'lucide-react-native'
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { duration, easing } from '@learnquiz/tokens/native'
import { percentText, type Profile } from '@learnquiz/api/progress'
import { unitPresentation } from '@/lib/profile-details'
import { useTheme } from '@/theme/ThemeProvider'
import { Bar } from '../ui/Bar'
import { Card } from '../ui/Card'
import { Chip } from '../ui/Chip'
import { Text } from '../ui/Text'
import { ConceptRow } from './ConceptRow'

export function UnitAccordion({ units, benchmark }: Pick<Profile, 'units' | 'benchmark'>) {
  const { space } = useTheme()
  if (units.length === 0) return null
  return (
    <View style={{ gap: space[3] }}>
      <Text header variant="title3">By unit</Text>
      <Card style={{ paddingVertical: 0 }}>
        {units.map((unit, index) => <UnitRow key={unit.id} unit={unit} benchmark={benchmark} first={index === 0} />)}
      </Card>
    </View>
  )
}

function UnitRow({ unit, benchmark, first }: { unit: Profile['units'][number]; benchmark: number; first: boolean }) {
  const { colors, space, sizes, typography } = useTheme()
  const [open, setOpen] = useState(first)
  const [focused, setFocused] = useState(false)
  const reducedMotion = useReducedMotion()
  const rotation = useSharedValue(first ? 180 : 0)
  const presentation = unitPresentation(unit)
  useEffect(() => {
    const target = open ? 180 : 0
    rotation.value = reducedMotion ? target : withTiming(target, {
      duration: duration.fast,
      easing: Easing.bezier(easing[0], easing[1], easing[2], easing[3]),
    })
  }, [open, reducedMotion, rotation])
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }))

  return (
    <View style={{ paddingTop: space[1], paddingBottom: space[4], borderTopWidth: first ? 0 : 1, borderTopColor: colors.border }}>
      <Pressable accessible focusable accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={`${unit.name}, ${presentation.spokenPercent}${presentation.estimate ? ', placement estimate' : ''}, benchmark ${percentText(benchmark)}`}
        onPress={() => setOpen((value) => !value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: sizes.target,
          paddingVertical: space[2], backgroundColor: pressed ? colors.surfaceSunken : undefined,
          outlineWidth: focused ? 2 : 0, outlineOffset: 2, outlineColor: colors.brand,
        })}>
        <Text accessible={false} importantForAccessibility="no" variant="bodyLg" style={{ flex: 1, fontFamily: typography.labelLg.fontFamily }}>{unit.name}</Text>
        <Text accessible={false} importantForAccessibility="no" variant="label" num muted={presentation.estimate}
          style={{ minWidth: 40, textAlign: 'right' }}>{presentation.percent}</Text>
        <Animated.View style={chevronStyle} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <ChevronDown size={space[4] + space[1]} color={colors.inkMuted} strokeWidth={2} accessible={false} />
        </Animated.View>
      </Pressable>
      <Bar value={presentation.value} benchmark={benchmark * 100} estimate={presentation.estimate}
        accessible={false} style={{ marginRight: space[4] + space[1] + space[2] }} />
      {presentation.chip && (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ marginTop: space[2] }}>
          <Chip variant={presentation.chip} />
        </View>
      )}
      {open && (
        <View style={{ gap: space[4], marginTop: space[4] }}>
          {presentation.caption && <Text variant="caption" muted>{presentation.caption}</Text>}
          {unit.concepts.map((concept) => <ConceptRow key={concept.id} concept={concept} benchmark={benchmark} />)}
        </View>
      )}
    </View>
  )
}
