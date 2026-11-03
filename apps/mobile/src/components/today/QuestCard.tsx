import { View } from 'react-native'
import type { TodayQuest } from '@learnquiz/api/today'
import { useTheme } from '@/theme/ThemeProvider'
import { Card } from '../ui/Card'
import { StatusMark } from '../ui/StatusMark'
import { Text } from '../ui/Text'

export type QuestCardProps = { quests: TodayQuest[] }

export function QuestCard({ quests }: QuestCardProps) {
  const { colors, space, sizes } = useTheme()
  if (quests.length === 0) return null
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="title3" header>Daily quest</Text>
      <Card paddingHorizontal={4} style={{ paddingVertical: 0 }}>
        {quests.map((q, index) => (
          <View
            key={q.key}
            accessible
            accessibilityRole="text"
            accessibilityLabel={[q.done ? 'Done' : 'Not done', q.label, q.count].filter(Boolean).join(', ')}
            style={{
              minHeight: sizes.topbarH,
              paddingVertical: space[3],
              flexDirection: 'row',
              alignItems: 'center',
              gap: space[3],
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: colors.border,
            }}
          >
            <StatusMark done={q.done} accessible={false} />
            <Text variant="body" style={{ flex: 1 }}>{q.label}</Text>
            {q.count ? <Text variant="caption" muted num>{q.count}</Text> : null}
          </View>
        ))}
      </Card>
    </View>
  )
}
