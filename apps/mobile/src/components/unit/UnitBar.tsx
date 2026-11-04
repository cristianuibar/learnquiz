import { View } from 'react-native'
import type { unitMastery } from '@/lib/unit'
import { useTheme } from '@/theme/ThemeProvider'
import { Bar } from '../ui/Bar'
import { Text } from '../ui/Text'

export type UnitBarProps = {
  mastery: ReturnType<typeof unitMastery>
}

// The unit's mastery against the benchmark: "82%" + "of 85% benchmark" over
// the large bar, which speaks "82%, benchmark 85%".
export function UnitBar({ mastery }: UnitBarProps) {
  const { space } = useTheme()
  return (
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: space[2] }}>
        <Text variant="title1" num>{mastery.percent}</Text>
        <Text muted num>{mastery.benchmarkLine}</Text>
      </View>
      <Bar
        size="lg"
        value={mastery.bar}
        benchmark={mastery.benchmark}
        accessibilityLabel={mastery.label}
        accessibilityValue={{ text: mastery.valueText }}
      />
    </View>
  )
}
