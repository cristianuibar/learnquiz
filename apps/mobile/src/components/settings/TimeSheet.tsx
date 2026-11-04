import { useRef } from 'react'
import { View, type Text as NativeText } from 'react-native'
import { X } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Sheet } from '../sheet/sheet'
import { IconButton } from '../ui/IconButton'
import { Text } from '../ui/Text'
import { Segment } from './Segmented'
import { useTheme } from '@/theme/ThemeProvider'

export function TimeSheet({ label, value, options, onSelect, onClose }: {
  label: string; value: number; options: { value: number; label: string }[]; onSelect(value: number): void; onClose(): void
}) {
  const { space } = useTheme()
  const insets = useSafeAreaInsets()
  const heading = useRef<NativeText | null>(null)
  return <Sheet focusRef={heading} onBack={() => { onClose(); return true }}
    band={<View style={{ flexDirection: 'row', alignItems: 'center', padding: space[4], paddingBottom: space[2] }}>
      <Text ref={heading} header variant="title2" style={{ flex: 1 }}>{label}</Text>
      <IconButton icon={X} accessibilityLabel="Close" onPress={onClose} />
    </View>}
    body={<View accessible={false} accessibilityRole="radiogroup" accessibilityLabel={label}
      style={{ gap: space[2], paddingHorizontal: space[4], paddingBottom: Math.max(space[2], insets.bottom) }}>
      {options.map((option) => <Segment key={option.value} label={option.label} radio selected={option.value === value}
        onPress={() => { onSelect(option.value); onClose() }} />)}
    </View>} />
}
