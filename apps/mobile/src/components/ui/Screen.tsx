import { useEffect, type ReactNode, type RefObject } from 'react'
import { AccessibilityInfo, findNodeHandle, View, type Text as NativeText } from 'react-native'
import { KeyboardAwareScrollView, KeyboardAvoidingView, useKeyboardState, type KeyboardAwareScrollViewProps } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../theme/ThemeProvider'

export type ScreenProps = KeyboardAwareScrollViewProps & {
  dock?: ReactNode
  footer?: ReactNode
}

export function useHeadingFocus(ref: RefObject<NativeText | null>) {
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const tag = ref.current && findNodeHandle(ref.current)
      if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag)
    })
    return () => cancelAnimationFrame(frame)
  }, [ref])
}

export function Screen({ children, dock, footer, contentContainerStyle, style, ...props }: ScreenProps) {
  const { colors, space } = useTheme()
  const insets = useSafeAreaInsets()
  const keyboardVisible = useKeyboardState((state) => state.isVisible)
  const bottom = keyboardVisible ? 0 : Math.max(space[2], insets.bottom)
  return (
    <KeyboardAvoidingView behavior="padding" style={{
      flex: 1,
      backgroundColor: colors.surfacePage,
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
    }}>
      <KeyboardAwareScrollView
        {...props}
        keyboardShouldPersistTaps="handled"
        style={[{ flex: 1 }, style]}
        contentContainerStyle={[{
          flexGrow: 1,
          paddingTop: space[8],
          paddingHorizontal: space[4],
          paddingBottom: dock || footer ? space[4] : space[4] + bottom,
          gap: space[6],
        }, contentContainerStyle]}
      >
        {children}
        {footer && (
          <View style={{ marginTop: 'auto', paddingTop: space[6], paddingBottom: space[3] + (dock ? 0 : bottom), alignItems: 'center' }}>
            {footer}
          </View>
        )}
      </KeyboardAwareScrollView>
      {dock && (
        <View style={{
          paddingTop: space[3],
          paddingHorizontal: space[4],
          paddingBottom: space[3] + bottom,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          gap: space[2],
        }}>
          {dock}
        </View>
      )}
    </KeyboardAvoidingView>
  )
}
