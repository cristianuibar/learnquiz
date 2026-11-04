import { View } from 'react-native'
import type { Profile } from '@learnquiz/api/progress'
import { percentText, proficiencyFact } from '@/lib/profile-progress'
import { useTheme } from '@/theme/ThemeProvider'
import { Bar } from '../ui/Bar'
import { Card } from '../ui/Card'
import { Text } from '../ui/Text'

export function MasteryCard({ profile }: { profile: Profile }) {
  const { colors, space } = useTheme()
  const fact = proficiencyFact(profile.proficiency)
  const mastery = percentText(profile.mastery)
  const benchmark = percentText(profile.benchmark)
  return (
    <Card accessible={false} role="group" accessibilityLabel="Role mastery" style={{ gap: space[4] }}>
      <View accessible accessibilityLabel={`${mastery} of ${benchmark} benchmark`}
        style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: space[2] }}>
        <Text accessible={false} importantForAccessibility="no" variant="display" num>{mastery}</Text>
        <Text accessible={false} importantForAccessibility="no" muted>of {benchmark} benchmark</Text>
      </View>
      <Bar size="lg" value={profile.mastery * 100} benchmark={profile.benchmark * 100}
        accessibilityLabel="Role mastery" accessibilityValue={{ text: `${mastery}, benchmark ${benchmark}` }} />
      {(profile.onboarding || fact) && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[4], paddingTop: space[4], borderTopWidth: 1, borderTopColor: colors.border }}>
          {profile.onboarding && <Text variant="label" num style={{ flexGrow: 1, flexBasis: '40%' }}>Day {profile.onboarding.day} of {profile.onboarding.days}</Text>}
          {fact && <Text variant="label" num style={{ flexGrow: 1, flexBasis: '40%' }}>{fact.text}</Text>}
        </View>
      )}
    </Card>
  )
}
