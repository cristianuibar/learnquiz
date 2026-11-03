import type { TodayHero } from '@learnquiz/api/today'
import { Check } from 'lucide-react-native'
import { View } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import { Bar } from '../ui/Bar'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Text } from '../ui/Text'

export type HeroProps = { hero: Exclude<TodayHero, { kind: 'empty' }>; onPlay: () => void }

export function Hero({ hero, onPlay }: HeroProps) {
  const { colors, space, scheme } = useTheme()
  const padding = { paddingTop: space[6], paddingHorizontal: space[4], paddingBottom: space[4] }

  if (hero.kind === 'done') {
    return (
      <Card style={{ ...padding, gap: space[6] }}>
        <View style={{ gap: space[1] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Check size={space[6]} color={colors.brand} strokeWidth={2} accessible={false} />
            <Text variant="title2">{hero.title}</Text>
          </View>
          <Text variant="body" muted>{hero.meta}</Text>
        </View>
        <Button variant="secondary" disabled={hero.action.disabled} accessibilityLabel={hero.action.accessibleLabel} onPress={onPlay}>{hero.action.label}</Button>
      </Card>
    )
  }

  const light = scheme === 'light'
  const surface = light ? colors.brand : colors.brandTint
  const heroText = light ? colors.onBrand : colors.ink
  const metaColor = light ? colors.onBrand : colors.inkMuted
  const total = hero.kind === 'building' ? hero.total : null
  const ready = hero.kind === 'building' ? hero.ready : null

  return (
    <Card style={{ ...padding, gap: space[8], backgroundColor: surface, borderColor: surface }}>
      <View style={{ gap: hero.kind === 'building' ? space[3] : space[1] }}>
        <Text variant="title2" style={{ color: heroText }}>{hero.title}</Text>
        {hero.kind === 'building' ? (
          <>
            {typeof total === 'number' && total > 0 && typeof ready === 'number' && (
              <Bar outline color={heroText} value={ready / total * 100} accessibilityLabel="Questions ready" accessibilityValue={{ text: hero.status ?? undefined }} />
            )}
            {hero.status !== null && (
              <Text variant="body" num style={{ color: heroText }}>{hero.status}</Text>
            )}
          </>
        ) : (
          <Text variant="body" num style={{ color: metaColor }}>{hero.meta}</Text>
        )}
      </View>
      <Button variant="accent" size="lg" disabled={hero.play.disabled} accessibilityLabel={hero.play.accessibleLabel} onPress={onPlay} style={{ alignSelf: 'stretch' }}>{hero.play.label}</Button>
    </Card>
  )
}
