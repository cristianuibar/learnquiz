import { View } from 'react-native'
import type { SheetHostProps } from './sheet'

export function SheetHost({ children, sheet }: SheetHostProps) {
  const open = sheet != null
  return (
    <View style={{ flex: 1 }}>
      <View
        accessibilityElementsHidden={open}
        importantForAccessibility={open ? 'no-hide-descendants' : 'auto'}
        style={{ flex: 1 }}
      >
        {children}
      </View>
      {open ? <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>{sheet}</View> : null}
    </View>
  )
}
