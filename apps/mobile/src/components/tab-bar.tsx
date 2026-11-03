import { useState, type ComponentProps } from 'react'
import { Pressable, View } from 'react-native'
import { Tabs } from 'expo-router'
import { House, Route, User } from 'lucide-react-native'
import { useToday } from '@/lib/today'
import { isTabDisabled, pressTab } from '@/lib/tab-bar'
import { useTheme } from '@/theme/ThemeProvider'
import { Text } from './ui/Text'

export type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0]

const icons = { today: House, path: Route, profile: User }

export function TabBar({ state, descriptors, navigation, insets }: TabBarProps) {
  const { colors, space, sizes } = useTheme()
  const { today } = useToday()
  const bottom = Math.max(space[2], insets.bottom)
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        minHeight: sizes.navH + bottom,
        paddingBottom: bottom,
        paddingLeft: insets.left,
        paddingRight: insets.right,
        backgroundColor: colors.surfaceCard,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      {state.routes.map((route, index) => (
        <TabItem
          key={route.key}
          label={descriptors[route.key]?.options.title ?? route.name}
          icon={icons[route.name as keyof typeof icons]}
          focused={state.index === index}
          disabled={isTabDisabled(route.name, today)}
          onPress={(focused, disabled) =>
            pressTab({
              routeKey: route.key,
              focused,
              disabled,
              emit: navigation.emit,
              navigate: () => navigation.navigate(route.name, route.params),
            })
          }
          onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
        />
      ))}
    </View>
  )
}

function TabItem({
  label,
  icon: Icon,
  focused,
  disabled,
  onPress,
  onLongPress,
}: {
  label: string
  icon: typeof House | undefined
  focused: boolean
  disabled: boolean
  onPress: (focused: boolean, disabled: boolean) => void
  onLongPress: () => void
}) {
  const { colors, space, radius, sizes } = useTheme()
  const [hasFocus, setHasFocus] = useState(false)
  const color = focused && !disabled ? colors.brand : colors.inkMuted
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused, disabled }}
      disabled={disabled}
      onPress={() => onPress(focused, disabled)}
      onLongPress={onLongPress}
      onFocus={() => setHasFocus(true)}
      onBlur={() => setHasFocus(false)}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[1] / 2,
        minHeight: sizes.target,
        outlineWidth: hasFocus ? 2 : 0,
        outlineOffset: -2,
        outlineColor: colors.brand,
      }}
    >
      <View
        style={{
          width: space[12] + space[2],
          height: space[8] - 2,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: focused && !disabled ? colors.brandTint : 'transparent',
        }}
      >
        {Icon ? <Icon size={space[6]} color={color} strokeWidth={2} accessible={false} /> : null}
      </View>
      <Text variant="overline" style={{ color, letterSpacing: 0 }}>{label}</Text>
    </Pressable>
  )
}
