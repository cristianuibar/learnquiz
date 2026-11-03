import { offlineBody, offlineTitle, todayError } from '@learnquiz/api/system-copy'
import type { TodayHero } from '@learnquiz/api/today'
import { Check, WifiOff } from 'lucide-react-native'
import { View } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import { Bar } from '../ui/Bar'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Text } from '../ui/Text'
import { RetryIcon } from '../ui/icons'

export type TodayNoticeStatus = 'offline' | 'error'

export type TodayNoticeProps = {
  status: TodayNoticeStatus
  refreshing: boolean
  onRetry: () => void
  onRetryFocus?: () => void
  onRetryBlur?: () => void
}

// Sunken status notice: the live region holds the status copy only, so the
// announcement fires once per status episode and retry/busy rerenders stay
// silent. The retry button lives outside the live region.
export function TodayNotice({ status, refreshing, onRetry, onRetryFocus, onRetryBlur }: TodayNoticeProps) {
  const { colors, space, radius } = useTheme()
  const offline = status === 'offline'
  return (
    <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: radius.md, padding: space[4], gap: space[3] }}>
      <View
        accessible
        role="status"
        accessibilityLiveRegion="polite"
        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[3] }}
      >
        <WifiOff size={space[6] - space[1]} strokeWidth={2} color={colors.ink} accessible={false} style={{ marginTop: space[1] / 2 }} />
        <View style={{ flex: 1 }}>
          <Text variant="label">{offline ? offlineTitle : todayError}</Text>
          {offline && <Text variant="body">{offlineBody}</Text>}
        </View>
      </View>
      <Button
        variant="secondary"
        icon={RetryIcon}
        busy={refreshing}
        onPress={onRetry}
        onFocus={onRetryFocus}
        onBlur={onRetryBlur}
        style={{ alignSelf: 'stretch' }}
      >
        Try again
      </Button>
    </View>
  )
}

export type OfflineLeadProps = {
  hero: Exclude<TodayHero, { kind: 'empty' }>
  onPlay: () => void
}

// Neutral offline rendering of the current hero data: card ground, disabled
// dashed sunken Play with the offline hint, nothing saffron.
export function OfflineLead({ hero, onPlay }: OfflineLeadProps) {
  const { colors, space } = useTheme()
  const padding = { paddingTop: space[6], paddingHorizontal: space[4], paddingBottom: space[4] }
  const card = { backgroundColor: colors.surfaceCard, borderColor: colors.border }

  if (hero.kind === 'done') {
    return (
      <Card style={{ ...padding, ...card, gap: space[6] }}>
        <View style={{ gap: space[1] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Check size={space[6]} color={colors.brand} strokeWidth={2} accessible={false} />
            <Text variant="title2">{hero.title}</Text>
          </View>
          <Text variant="body" muted>{hero.meta}</Text>
        </View>
        <Button
          variant="secondary"
          disabled
          accessibilityLabel={hero.action.accessibleLabel}
          accessibilityHint={offlineBody}
          onPress={onPlay}
        >
          {hero.action.label}
        </Button>
      </Card>
    )
  }

  const total = hero.kind === 'building' ? hero.total : null
  const ready = hero.kind === 'building' ? hero.ready : null

  return (
    <Card style={{ ...padding, ...card, gap: space[8] }}>
      <View style={{ gap: hero.kind === 'building' ? space[3] : space[1] }}>
        <Text variant="title2">{hero.title}</Text>
        {hero.kind === 'building' ? (
          <>
            {typeof total === 'number' && total > 0 && typeof ready === 'number' && (
              <Bar value={ready / total * 100} accessibilityLabel="Questions ready" accessibilityValue={{ text: hero.status ?? undefined }} />
            )}
            {hero.status !== null && (
              <Text variant="body" num>{hero.status}</Text>
            )}
          </>
        ) : (
          <Text variant="body" num muted>{hero.meta}</Text>
        )}
      </View>
      <Button
        variant="secondary"
        size="lg"
        disabled
        accessibilityLabel={hero.play.accessibleLabel}
        accessibilityHint={offlineBody}
        onPress={onPlay}
        style={{ alignSelf: 'stretch' }}
      >
        {hero.play.label}
      </Button>
    </Card>
  )
}
