import { View } from 'react-native'
import type { ConceptRowModel } from '@/lib/unit'
import { useTheme } from '@/theme/ThemeProvider'
import { Bar } from '../ui/Bar'
import { Chip } from '../ui/Chip'
import { Text } from '../ui/Text'

export type ConceptRowProps = {
  row: ConceptRowModel
  benchmark: number
  first: boolean
}

// One concept in the Concepts card: name and percent, a bar with the
// benchmark that speaks the whole row, then the status chip and Critical.
export function ConceptRow({ row, benchmark, first }: ConceptRowProps) {
  const { colors, space } = useTheme()
  return (
    <View style={{
      gap: space[2],
      paddingTop: space[3],
      paddingBottom: space[4],
      borderTopWidth: first ? 0 : 1,
      borderTopColor: colors.border,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space[3] }}>
        <Text header style={{ flex: 1, fontWeight: '500' }}>{row.name}</Text>
        <Text variant="label" num style={{ paddingTop: 1 }}>{row.percent}</Text>
      </View>
      <Bar
        value={row.bar}
        benchmark={benchmark}
        accessibilityLabel={row.barLabel}
        accessibilityValue={{ text: row.valueText }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <Chip variant={row.chip} />
        {row.critical && <Chip variant="critical" />}
      </View>
    </View>
  )
}
