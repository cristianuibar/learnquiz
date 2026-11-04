import type { Profile } from '@learnquiz/api/progress'
import { profileEmptyView } from '@learnquiz/api/profile-empty'
import { useTheme } from '@/theme/ThemeProvider'
import { Bar } from '../ui/Bar'
import { Card } from '../ui/Card'
import { Text } from '../ui/Text'

export function ProfileEmpty({ profile }: { profile: Profile }) {
  const { space } = useTheme()
  const view = profileEmptyView(profile)
  return (
    <Card style={{ gap: space[4], backgroundColor: 'transparent' }}>
      <Text variant="title2" num>{view.heading}</Text>
      <Bar size="lg" value={0} benchmark={profile.benchmark * 100} accessibilityLabel="Role mastery"
        accessibilityValue={{ text: view.barValueText }} />
      <Text>{view.body}</Text>
    </Card>
  )
}
