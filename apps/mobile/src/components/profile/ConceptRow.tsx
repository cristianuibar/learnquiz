import { View } from 'react-native'
import { percentText, type Profile } from '@learnquiz/api/progress'
import { conceptPresentation } from '@/lib/profile-details'
import { useTheme } from '@/theme/ThemeProvider'
import { Bar } from '../ui/Bar'
import { Chip } from '../ui/Chip'
import { Text } from '../ui/Text'

export function ConceptRow({ concept, benchmark }: { concept: Profile['units'][number]['concepts'][number]; benchmark: number }) {
  const { space } = useTheme()
  const presentation = conceptPresentation(concept)
  const status = { mastered: 'Mastered', learning: 'Still learning', not_started: 'Not started' }[concept.status]
  return (
    <View style={{ gap: space[2] }}>
      <Text>{concept.name}</Text>
      {presentation.showBar && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <Bar value={concept.pKnown * 100} benchmark={benchmark * 100} style={{ flex: 1 }}
            accessibilityLabel={`${concept.name} mastery`}
            accessibilityValue={{ text: `${presentation.percent}, ${status}${concept.critical ? ', critical' : ''}, benchmark ${percentText(benchmark)}` }} />
          <Text variant="label" num style={{ minWidth: 40, textAlign: 'right' }}>{presentation.percent}</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {presentation.chips.map((chip) => <Chip key={chip} variant={chip} />)}
      </View>
    </View>
  )
}
