import type { RefObject } from 'react'
import { View, type Text as NativeText } from 'react-native'
import { Eye } from 'lucide-react-native'
import { IconButton } from '../ui/IconButton'
import { SettingsIcon } from '../ui/icons'
import { Text } from '../ui/Text'
import { useTheme } from '@/theme/ThemeProvider'

export function ProfileHeader({ name, role, headingRef, settingsRef, onSettings }: {
  name: string | null
  role: string | null
  headingRef: RefObject<NativeText | null>
  settingsRef: RefObject<View | null>
  onSettings(): void
}) {
  const { colors, space } = useTheme()
  return (
    <View style={{ gap: space[1] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Text ref={headingRef} header variant="title1" style={{ flex: 1 }}>Training progress</Text>
        <IconButton ref={settingsRef} icon={SettingsIcon} accessibilityLabel="Settings" onPress={onSettings} />
      </View>
      {name && <Text>{[name, role].filter(Boolean).join(' · ')}</Text>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1], marginTop: space[1] }}>
        <Eye size={space[4]} color={colors.inkMuted} strokeWidth={2} accessible={false} />
        <Text variant="caption" muted style={{ flex: 1 }}>Your company's training admins see this same page.</Text>
      </View>
    </View>
  )
}
