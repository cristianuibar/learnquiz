import { View } from 'react-native'
import type { Profile } from '@learnquiz/api/progress'
import { criticalSteps } from '@/lib/profile-details'
import { useTheme } from '@/theme/ThemeProvider'
import { Card } from '../ui/Card'
import { Chip } from '../ui/Chip'
import { Text } from '../ui/Text'

export function CriticalSteps({ confidentErrors }: Pick<Profile, 'confidentErrors'>) {
  const { colors, space } = useTheme()
  const rows = criticalSteps(confidentErrors)
  if (rows.length === 0) return null
  return (
    <View style={{ gap: space[3] }}>
      <Text header variant="title3">Critical steps to recheck</Text>
      <Card style={{ paddingVertical: 0 }}>
        {rows.map((row, index) => (
          <View key={row.id} style={{ gap: space[2], paddingVertical: space[3], borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.border }}>
            <Chip variant={row.chip}>{row.chipText}</Chip>
            <View style={{ gap: space[1] }}>
              <Text>{row.concept}</Text>
              <Text variant="caption" muted num>{row.caption}</Text>
            </View>
          </View>
        ))}
      </Card>
    </View>
  )
}
