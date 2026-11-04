import { Alert, Linking, View } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import { Button } from '../ui/Button'
import { LinkButton } from '../ui/LinkButton'
import { Text } from '../ui/Text'

export type EmptyStateProps = { companyMember: boolean; onRetry?: () => void; onSignOut: () => void }

export function EmptyState({ companyMember, onRetry, onSignOut }: EmptyStateProps) {
  const { colors, space, radius } = useTheme()
  return (
    <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: radius.md, padding: space[4], gap: space[3] }}>
      <Text variant="title3" header>No training yet</Text>
      <Text variant="body">{companyMember
        ? 'Your company hasn’t assigned you a role. Ask your manager.'
        : 'Your topic may still be preparing. Open Learn Quiz on the web to check it or start a new topic.'}</Text>
      {!companyMember && (
        <LinkButton
          accessibilityLabel="Open topics on the web, opens browser"
          onPress={() => {
            void Linking.openURL('https://app.learnquiz.com/start').catch(() => {
              Alert.alert('Could not open browser', 'Visit https://app.learnquiz.com/start to check or start your topic.')
            })
          }}
        >Open topics on the web</LinkButton>
      )}
      {onRetry && <Button variant="secondary" onPress={onRetry}>Try again</Button>}
      <LinkButton onPress={onSignOut} style={{ alignSelf: 'center' }}>Sign out</LinkButton>
    </View>
  )
}
