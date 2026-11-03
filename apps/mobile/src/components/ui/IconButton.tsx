import { useState, type ComponentType } from 'react'
import { Pressable, type PressableProps } from 'react-native'
import type { LucideProps } from 'lucide-react-native'
import { useTheme } from '../../theme/ThemeProvider'

export type IconButtonProps = Omit<PressableProps, 'children' | 'accessibilityLabel'> & {
  accessibilityLabel: string
  icon: ComponentType<LucideProps>
  toggle?: boolean
  checked?: boolean
}

export function IconButton({ icon: Icon, toggle, checked = false, style, onFocus, onBlur, ...props }: IconButtonProps) {
  const { colors, sizes, space, radius } = useTheme()
  const [focused, setFocused] = useState(false)
  return (
    <Pressable
      {...props}
      accessible
      focusable
      accessibilityRole="button"
      accessibilityState={{ ...props.accessibilityState, ...(toggle ? { checked } : {}) }}
      onFocus={(event) => { setFocused(true); onFocus?.(event) }}
      onBlur={(event) => { setFocused(false); onBlur?.(event) }}
      style={(state) => [
        {
          width: sizes.target,
          height: sizes.target,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: toggle && checked ? colors.brandTint : state.pressed ? colors.surfaceSunken : undefined,
          outlineWidth: focused ? 2 : 0,
          outlineOffset: 2,
          outlineColor: colors.brand,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      <Icon size={space[6]} strokeWidth={2} color={toggle && checked ? colors.brand : colors.ink} accessible={false} />
    </Pressable>
  )
}
