import { View } from 'react-native'
import { Check, RotateCw } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import type { Profile } from '@learnquiz/api/progress'
import { criticalSteps } from '@/lib/profile-details'
import { useTheme } from '@/theme/ThemeProvider'
import { Card } from '../ui/Card'
import { Chip } from '../ui/Chip'
import { Text } from '../ui/Text'
import { Button } from '../ui/Button'

export function CriticalSteps({ confidentErrors }: Pick<Profile, 'confidentErrors'>) {
  const { colors, space } = useTheme()
  const router = useRouter()
  const rows = criticalSteps(confidentErrors)
  if (rows.length === 0) return null
  return (
    <View style={{ gap: space[3] }}>
      <Text header variant="title3">Critical steps to recheck</Text>
      <Card style={{ paddingVertical: 0 }}>
        {rows.map((row, index) => (
          <View key={row.id} style={{ gap: space[2], paddingVertical: space[3], borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.border }}>
            <Chip variant={row.chip} icon={row.correctedAt === null ? RotateCw : Check}>{row.chipText}</Chip>
            <View style={{ gap: space[1] }}>
              <Text>{row.concept}</Text>
              <Text variant="caption" muted num>{row.caption}</Text>
            </View>
            <Button variant="secondary" onPress={() => router.push({ pathname: '/flag', params: { conceptId: row.conceptId } })}>
              Flag an unfair result
            </Button>
          </View>
        ))}
      </Card>
    </View>
  )
}
