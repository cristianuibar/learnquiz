import { StyleSheet, View } from 'react-native'
import { revealCopy } from '@learnquiz/api/reveal'
import { useTheme } from '../../theme/ThemeProvider'
import { Text } from '../ui/Text'
import { CriticalIcon } from '../ui/icons'

export function CriticalRow() {
  const { colors, space } = useTheme()
  return (
    <View
      accessible
      accessibilityLabel={`${revealCopy.criticalStep}. ${revealCopy.comesBackFirst}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        paddingVertical: space[3],
        borderTopWidth: StyleSheet.hairlineWidth,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      }}
    >
      <CriticalIcon size={space[4] + space[1]} color={colors.ink} />
      <Text variant="caption" style={{ flex: 1, color: colors.ink }}>
        <Text variant="caption" style={{ fontWeight: '700', color: colors.ink }}>{revealCopy.criticalStep}</Text>
        {` · ${revealCopy.comesBackFirst}`}
      </Text>
    </View>
  )
}
