import type { ReactNode } from 'react'
import { View } from 'react-native'
import { X } from 'lucide-react-native'
import { KeyboardAwareScrollView, KeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Progress } from '@learnquiz/api'
import { useTheme } from '../../theme/ThemeProvider'
import { Bar } from '../ui/Bar'
import { IconButton } from '../ui/IconButton'
import { Text } from '../ui/Text'

export type SessionFrameProps = {
  children: ReactNode
  dock?: ReactNode
  trailing?: ReactNode
  inert?: boolean
  progress?: Progress
  onEnd(): void
  topBar?: { kind: 'label'; label: string }
}

export function SessionFrame({ children, dock, trailing, inert = false, progress, onEnd, topBar }: SessionFrameProps) {
  const { colors, sizes, space } = useTheme()
  const insets = useSafeAreaInsets()
  const keyboardVisible = useKeyboardState((state) => state.isVisible)
  const bottom = keyboardVisible ? 0 : Math.max(space[2], insets.bottom)
  const count = !progress ? '' : progress.totalKnown === false ? `Question ${progress.position}` : `${progress.position} of ${progress.total}`

  return (
    <View
      pointerEvents={inert ? 'none' : 'auto'}
      accessibilityElementsHidden={inert}
      importantForAccessibility={inert ? 'no-hide-descendants' : 'auto'}
      style={{ flex: 1, backgroundColor: colors.surfacePage, paddingLeft: insets.left, paddingRight: insets.right }}
    >
      <View style={{
        minHeight: sizes.topbarH + insets.top,
        paddingTop: insets.top,
        paddingHorizontal: space[2],
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
      }}>
        <IconButton icon={X} accessibilityLabel="End session" onPress={onEnd} />
        {topBar?.kind === 'label' ? (
          <Text variant="label" num muted style={{ flex: 1 }}>{topBar.label}</Text>
        ) : (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            {progress ? (
              <>
                <Bar
                  value={progress.totalKnown !== false && progress.total > 0 ? progress.position / progress.total * 100 : 0}
                  accessibilityRole="progressbar"
                  accessibilityLabel="Session progress"
                  accessibilityValue={progress.totalKnown === false ? { min: undefined, max: undefined, now: undefined, text: count } : { min: 0, max: progress.total, now: progress.position, text: count }}
                  style={{ flex: 1 }}
                />
                <Text variant="overline" num muted accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{count}</Text>
              </>
            ) : null}
          </View>
        )}
        {trailing}
      </View>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <KeyboardAwareScrollView
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: space[2],
            paddingHorizontal: space[4],
            paddingBottom: space[6] + (dock ? 0 : bottom),
            gap: space[6],
          }}
        >
          {children}
        </KeyboardAwareScrollView>
        {dock}
      </KeyboardAvoidingView>
    </View>
  )
}
