import { View } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import { Button } from '../ui/Button'
import { LinkButton } from '../ui/LinkButton'
import { Text } from '../ui/Text'

export type EmptyStateProps = { onRetry: () => void; onSignOut: () => void }

export function EmptyState({ onRetry, onSignOut }: EmptyStateProps) {
  const { colors, space, radius } = useTheme()
  return (
    <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: radius.md, padding: space[4], gap: space[3] }}>
      <Text variant="title3" header>No training yet</Text>
      <Text variant="body">Your company hasn’t assigned you a role. Ask your manager.</Text>
      <Button variant="secondary" onPress={onRetry}>Try again</Button>
      <LinkButton onPress={onSignOut} style={{ alignSelf: 'center' }}>Sign out</LinkButton>
    </View>
  )
}
