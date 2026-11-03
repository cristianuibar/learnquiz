import { View } from 'react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { barValueText, gainWidths, percent } from '../../lib/summary-format'
import { Bar } from '../ui/Bar'
import { Text } from '../ui/Text'

export type MasteryRow = { unitId: string; unitName: string; before: number; after: number }

export function MasteryMoved({ rows, benchmark }: { rows: MasteryRow[]; benchmark: number | null }) {
  const { colors, space } = useTheme()
  if (rows.length === 0) return null
  return (
    <View style={{ gap: space[1] }}>
      <Text variant="title3" header>Mastery moved</Text>
      <View>
        {rows.map((row, index) => {
          const w = gainWidths(row.before, row.after)
          return (
            <View
              key={row.unitId}
              style={{
                gap: space[2],
                paddingVertical: space[3],
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space[3] }}>
                <Text variant="body" style={{ flexShrink: 1 }}>{row.unitName}</Text>
                <Text variant="label" num>
                  <Text variant="label" num muted style={{ fontWeight: '500' }}>{`${percent(row.before)}%`}</Text>
                  {` → ${percent(row.after)}%`}
                </Text>
              </View>
              <Bar
                before={w.before}
                value={w.before + w.gain}
                benchmark={benchmark === null ? undefined : percent(benchmark)}
                accessibilityLabel={`${row.unitName} mastery`}
                accessibilityValue={{ text: barValueText(row.before, row.after, benchmark) }}
              />
            </View>
          )
        })}
      </View>
    </View>
  )
}
