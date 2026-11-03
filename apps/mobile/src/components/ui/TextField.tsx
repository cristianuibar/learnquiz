import { useId, useState, type ReactNode } from 'react'
import { TextInput, View, type TextInputProps } from 'react-native'
import { Lock } from 'lucide-react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { Text } from './Text'

export type TextFieldProps = TextInputProps & {
  ref?: React.Ref<TextInput>
  label: string
  helper?: string
  hint?: string
  trailing?: ReactNode
  locked?: boolean
}

export function TextField({ label, helper, hint, trailing, locked, style, onFocus, onBlur, ...props }: TextFieldProps) {
  const { colors, typography, space, radius, sizes } = useTheme()
  const id = useId()
  const [focused, setFocused] = useState(false)
  return (
    <View
      style={{ gap: space[1] }}
      accessible={locked}
      accessibilityLabel={locked ? `${label}, ${props.value ?? props.defaultValue ?? ''}` : undefined}
      accessibilityHint={locked ? hint ?? helper : undefined}
    >
      <Text variant="label" nativeID={id}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {locked ? (
          <View style={{
            flex: 1,
            minHeight: sizes.target,
            paddingVertical: space[3],
            paddingHorizontal: space[4],
            paddingRight: sizes.target,
            borderWidth: 2,
            borderColor: colors.border,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceSunken,
          }}>
            <Text style={{ fontSize: typography.labelLg.fontSize, lineHeight: typography.labelLg.lineHeight }}>{props.value ?? props.defaultValue}</Text>
          </View>
        ) : (
          <TextInput
            {...props}
            accessibilityLabel={props.accessibilityLabel ?? label}
            accessibilityLabelledBy={id}
            accessibilityHint={props.accessibilityHint ?? hint ?? helper}
            placeholderTextColor={colors.inkMuted}
            selectionColor={colors.brand}
            onFocus={(event) => { setFocused(true); onFocus?.(event) }}
            onBlur={(event) => { setFocused(false); onBlur?.(event) }}
            style={[
              {
                flex: 1,
                minHeight: sizes.target,
                paddingVertical: space[3],
                paddingHorizontal: space[4],
                paddingRight: trailing ? sizes.target : space[4],
                borderWidth: 2,
                borderColor: focused ? colors.brand : colors.borderStrong,
                borderRadius: radius.md,
                backgroundColor: colors.surfaceCard,
                color: colors.ink,
                fontFamily: typography.body.fontFamily,
                fontSize: typography.labelLg.fontSize,
                lineHeight: typography.labelLg.lineHeight,
                outlineWidth: focused ? 2 : 0,
                outlineOffset: 2,
                outlineColor: colors.brand,
              },
              style,
            ]}
          />
        )}
        {(locked || trailing) && (
          <View
            style={{ position: 'absolute', right: 2 }}
            pointerEvents={locked ? 'none' : 'auto'}
            accessible={false}
            importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'}
            accessibilityElementsHidden={locked}
          >
            {locked ? (
              <View style={{ width: sizes.target, height: sizes.target, alignItems: 'center', justifyContent: 'center' }}>
                <Lock size={space[6] - space[1]} strokeWidth={2} color={colors.inkMuted} accessible={false} />
              </View>
            ) : trailing}
          </View>
        )}
      </View>
      {helper && <Text variant="caption" muted>{helper}</Text>}
    </View>
  )
}
