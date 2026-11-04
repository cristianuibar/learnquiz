import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { AccessibilityInfo, BackHandler, findNodeHandle, ScrollView, useWindowDimensions, View, type Text as NativeText } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { duration, easing } from '@learnquiz/tokens/native'
import { useTheme } from '../../theme/ThemeProvider'

export type SheetProps = {
  /** Pinned above the body; does not shrink. */
  band?: ReactNode
  /** Scrolls when the sheet reaches its max height. */
  body: ReactNode
  /** Pinned below the body; rides above the keyboard. */
  foot?: ReactNode
  /** Decorative 36 x 4 grabber; hidden from TalkBack and not draggable. */
  grabber?: boolean
  /** Android Back while the sheet is mounted. Return true to consume it. */
  onBack?: () => boolean
  /** Accessibility focus moves here once after mount. */
  focusRef?: RefObject<View | NativeText | null>
}

export type SheetHostProps = {
  /** The screen, including its top bar. Hidden from TalkBack while a sheet is open. */
  children: ReactNode
  /** The open sheet, or null when none is open. */
  sheet: ReactNode | null
}

function useSheetFocus(ref: RefObject<View | NativeText | null> | undefined) {
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const tag = ref?.current && findNodeHandle(ref.current)
      if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag)
    })
    return () => cancelAnimationFrame(frame)
  }, [ref])
}

export function Sheet({ band, body, foot, grabber, onBack, focusRef }: SheetProps) {
  const { colors, space, radius, shadow } = useTheme()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const reducedMotion = useReducedMotion()
  const [animate] = useState(!reducedMotion)
  const progress = useSharedValue(animate ? 0 : 1)
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack

  useEffect(() => {
    if (animate) progress.value = withTiming(1, { duration: duration.reveal, easing: Easing.bezier(...easing) })
  }, [animate, progress])
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => onBackRef.current?.() ?? false)
    return () => subscription.remove()
  }, [])
  useSheetFocus(focusRef)

  const riseStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: space[8] * (1 - progress.value) }],
  }))

  return (
    <>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim }}
      />
      <KeyboardAvoidingView behavior="padding" pointerEvents="box-none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'flex-end' }}>
        <Animated.View
          accessibilityViewIsModal
          style={[{
            backgroundColor: colors.surfaceCard,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            elevation: 8,
            ...shadow.raised,
            maxHeight: height - insets.top - space[12],
            overflow: 'hidden',
          }, riseStyle]}
        >
          {band ? <View style={{ flexShrink: 0 }}>{band}</View> : null}
          {grabber ? (
            <View
              testID="sheet-grabber"
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ position: 'absolute', top: space[2], zIndex: 1, alignSelf: 'center', width: space[8] + space[1], height: space[1], borderRadius: radius.full, backgroundColor: colors.borderStrong }}
            />
          ) : null}
          <ScrollView persistentScrollbar keyboardShouldPersistTaps="handled" style={{ flexShrink: 1, flexGrow: 0 }}>
            {body}
          </ScrollView>
          {foot ? (
            <View style={{
              flexShrink: 0,
              paddingTop: space[3],
              paddingHorizontal: space[4],
              paddingBottom: space[3] + Math.max(space[2], insets.bottom),
              gap: space[1],
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}>
              {foot}
            </View>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </>
  )
}
