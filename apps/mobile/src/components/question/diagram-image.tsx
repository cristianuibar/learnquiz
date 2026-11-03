import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import type { ItemView } from '@learnquiz/api'
import { mediaSource } from '../../lib/api'
import { diagramImageSize } from '../../lib/diagram-image'
import { useTheme } from '../../theme/ThemeProvider'
import { AlertRow } from '../ui/AlertRow'
import { LinkButton } from '../ui/LinkButton'

type DiagramImageProps = { image: NonNullable<ItemView['image']> }

export function DiagramImage({ image }: DiagramImageProps) {
  return <DiagramSource key={image.src} image={image} />
}

function DiagramSource({ image }: DiagramImageProps) {
  const [attempt, setAttempt] = useState(0)
  return <DiagramAttempt key={attempt} image={image} onRetry={() => setAttempt((value) => value + 1)} />
}

function DiagramAttempt({ image, onRetry }: DiagramImageProps & { onRetry(): void }) {
  const { colors, radius, space } = useTheme()
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading')

  if (status === 'failed') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSunken, borderRadius: radius.md }}>
        <AlertRow style={{ flex: 1 }}>The diagram could not be loaded.</AlertRow>
        <LinkButton onPress={onRetry} style={{ marginRight: space[2] }}>Try again</LinkButton>
      </View>
    )
  }

  return (
    <View style={{
      ...diagramImageSize(image),
      width: '100%',
      alignSelf: 'center',
      overflow: 'hidden',
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surfaceCard,
    }}>
      <Image
        source={mediaSource(image.src)}
        contentFit="contain"
        accessibilityRole="image"
        accessibilityLabel={image.alt}
        accessible={status === 'loaded'}
        accessibilityElementsHidden={status !== 'loaded'}
        importantForAccessibility={status === 'loaded' ? 'auto' : 'no-hide-descendants'}
        style={StyleSheet.absoluteFill}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('failed')}
      />
      {status === 'loading' && (
        <View
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]}
        />
      )}
    </View>
  )
}
