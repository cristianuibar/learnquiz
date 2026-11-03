import { useCallback, useRef, useState } from 'react'
import { AccessibilityInfo, findNodeHandle, Pressable, View, type Text as NativeText } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { ChevronRight } from 'lucide-react-native'
import { Button } from '@/components/ui/Button'
import { Screen } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { endSession, useSession } from '@/lib/session-store'
import { useTheme } from '@/theme/ThemeProvider'

export default function Profile() {
  const { colors, space, sizes } = useTheme()
  const router = useRouter()
  const { user } = useSession()
  const headingRef = useRef<NativeText | null>(null)
  // A tab screen stays mounted, so focus the heading on every arrival (for
  // example from the Today role card), not only on the first mount.
  useFocusEffect(useCallback(() => {
    const frame = requestAnimationFrame(() => {
      const tag = headingRef.current && findNodeHandle(headingRef.current)
      if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag)
    })
    return () => cancelAnimationFrame(frame)
  }, []))
  const [focused, setFocused] = useState(false)
  const [busy, setBusy] = useState(false)

  const handleSignOut = async () => {
    if (busy) return
    setBusy(true)
    // endSession() never rejects and always drops the session, so the route guard
    // alone moves the learner to sign-in, even when cleanup or push unregistration fails.
    try {
      await endSession()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen contentContainerStyle={{ paddingTop: space[2], paddingBottom: space[8] }}>
      <View style={{ gap: space[1] }}>
        <Text ref={headingRef} header variant="title1">
          Training progress
        </Text>
        {user?.name ? <Text variant="body">{user.name}</Text> : null}
      </View>
      <View style={{ gap: space[1] }}>
        <Text header variant="title3">
          Account
        </Text>
        <Pressable
          accessible
          focusable
          accessibilityRole="link"
          accessibilityLabel="What we record"
          onPress={() => router.push({ pathname: '/welcome', params: { review: '1' } })}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={({ pressed }) => ({
            minHeight: sizes.topbarH,
            paddingVertical: space[3],
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[3],
            backgroundColor: pressed ? colors.surfaceSunken : 'transparent',
            outlineWidth: focused ? 2 : 0,
            outlineOffset: 2,
            outlineColor: colors.brand,
          })}
        >
          <Text variant="bodyLg" style={{ flex: 1 }} importantForAccessibility="no">
            What we record
          </Text>
          <ChevronRight size={space[6]} color={colors.inkMuted} strokeWidth={2} accessible={false} />
        </Pressable>
        <View style={{ paddingTop: space[3] }}>
          <Button variant="secondary" busy={busy} onPress={handleSignOut}>
            Sign out
          </Button>
        </View>
      </View>
    </Screen>
  )
}
