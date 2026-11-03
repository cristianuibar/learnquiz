import { useState } from 'react'
import { View } from 'react-native'
import { Image, type ImageProps } from 'expo-image'
import { themes } from '@learnquiz/tokens/native'
import { useTheme } from '../../theme/ThemeProvider'
import { Text } from './Text'

export type OrgLogoProps = {
  name: string
  source?: ImageProps['source']
  size?: 32 | 56
  accent?: boolean
}

export function OrgLogo({ name, source, size = 32, accent }: OrgLogoProps) {
  const { colors, space, sizes, radius, typography, scheme } = useTheme()
  const [failedSource, setFailedSource] = useState<ImageProps['source']>()
  const branded = accent ?? colors.brand !== themes[scheme].brand
  const words = name.trim().split(/\s+/)
  const initials = (words.length > 1 ? `${words[0][0]}${words[1][0]}` : Array.from(words[0]).slice(0, 2).join('')).toLocaleUpperCase() || 'LQ'
  const dimension = size === 56 ? sizes.topbarH : space[8]
  return (
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{
      width: dimension,
      height: dimension,
      borderRadius: size === 56 ? space[3] : radius.md,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: branded ? colors.brand : colors.ink,
    }}>
      {source && source !== failedSource ? (
        <Image source={source} contentFit="contain" accessible={false} style={{ width: '100%', height: '100%' }} onError={() => setFailedSource(source)} />
      ) : (
        <Text style={{
          fontFamily: typography.title3.fontFamily,
          fontSize: size === 56 ? typography.title2.fontSize : typography.caption.fontSize,
          color: branded ? colors.onBrand : colors.surfacePage,
        }}>{initials}</Text>
      )}
    </View>
  )
}
