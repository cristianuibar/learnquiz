import { useRef } from 'react'
import { Modal, ScrollView, View, type Text as NativeText } from 'react-native'
import { X } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { IconButton } from '../ui/IconButton'
import { Text } from '../ui/Text'
import { useHeadingFocus } from '../ui/Screen'
import { Segment } from './Segmented'
import { useTheme } from '@/theme/ThemeProvider'

export function TimeSheet({ label, value, options, onSelect, onClose }: {
  label: string; value: number; options: { value: number; label: string }[]; onSelect(value: number): void; onClose(): void
}) {
  const { colors, space, radius } = useTheme()
  const insets = useSafeAreaInsets()
  const heading = useRef<NativeText | null>(null)
  useHeadingFocus(heading)
  return <Modal transparent animationType="none" onRequestClose={onClose}>
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }}>
      <View accessibilityViewIsModal style={{ maxHeight: '80%', backgroundColor: colors.surfaceCard, borderTopLeftRadius: radius.lg,
        borderTopRightRadius: radius.lg, padding: space[4], paddingBottom: Math.max(space[2], insets.bottom), gap: space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text ref={heading} header variant="title2" style={{ flex: 1 }}>{label}</Text>
          <IconButton icon={X} accessibilityLabel="Close" onPress={onClose} />
        </View>
        <ScrollView accessible={false} accessibilityRole="radiogroup" accessibilityLabel={label} contentContainerStyle={{ gap: space[2] }}>
          {options.map((option) => <Segment key={option.value} label={option.label} radio selected={option.value === value}
            onPress={() => { onSelect(option.value); onClose() }} />)}
        </ScrollView>
      </View>
    </View>
  </Modal>
}
