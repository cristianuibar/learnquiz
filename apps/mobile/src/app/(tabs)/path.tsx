import { useCallback, useRef } from 'react'
import { AccessibilityInfo, findNodeHandle, ScrollView, View, type Text as NativeText } from 'react-native'
import { useFocusEffect, useRouter, useScrollToTop } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { networkError } from '@learnquiz/api/system-copy'
import { PathHeader } from '@/components/path/PathHeader'
import { UnitRow } from '@/components/path/UnitRow'
import { AlertRow } from '@/components/ui/AlertRow'
import { Button } from '@/components/ui/Button'
import { RetryIcon } from '@/components/ui/icons'
import { Text } from '@/components/ui/Text'
import { getToken } from '@/lib/auth'
import { isPreparing, pathError, preparingText, unitHref, unitRows } from '@/lib/path'
import { useToday } from '@/lib/today'
import { useTopicPath } from '@/lib/topic-path'
import { useTheme } from '@/theme/ThemeProvider'

export default function PathScreen() {
  const { today } = useToday()
  const topicId = today?.topic?.id ?? null
  const { path, status, owner, retry } = useTopicPath(topicId)
  const { colors, space, radius } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const heading = useRef<NativeText>(null)
  const scroll = useRef<ScrollView>(null)
  const rowRefs = useRef(new Map<string, View>())
  const returnTo = useRef<string | null>(null)
  useScrollToTop(scroll)

  // Tabs stay mounted: on every arrival focus the heading, or the unit row
  // the learner opened when they come back from Unit.
  useFocusEffect(useCallback(() => {
    const frame = requestAnimationFrame(() => {
      const unitId = returnTo.current
      returnTo.current = null
      const target = (unitId ? rowRefs.current.get(unitId) : undefined) ?? heading.current
      const tag = target && findNodeHandle(target)
      if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag)
    })
    return () => cancelAnimationFrame(frame)
  }, []))

  const open = useCallback((unitId: string) => {
    // Only a path fetched under the current token may navigate.
    if (!path || owner === null || owner !== getToken()) return
    returnTo.current = unitId
    router.push(unitHref(unitId, path.topic.id))
  }, [path, owner, router])

  const rows = path && !isPreparing(path) ? unitRows(path) : []
  const failed = status === 'offline' || status === 'error'

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfacePage, paddingLeft: insets.left, paddingRight: insets.right }}>
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + space[6], paddingHorizontal: space[4], paddingBottom: space[6], gap: space[6] }}
      >
        <PathHeader title={path?.topic.title ?? today?.topic?.title ?? null} path={path} headingRef={heading} />
        {failed && (
          <View style={{ gap: space[3] }}>
            <AlertRow>{status === 'offline' ? networkError : pathError}</AlertRow>
            <Button variant="secondary" icon={RetryIcon} onPress={retry}>Try again</Button>
          </View>
        )}
        {!path ? (
          !failed && <Skeleton />
        ) : isPreparing(path) ? (
          <View
            accessible
            role="status"
            accessibilityLiveRegion="polite"
            style={{ backgroundColor: colors.surfaceSunken, borderRadius: radius.md, padding: space[4] }}
          >
            <Text variant="label">{preparingText}</Text>
          </View>
        ) : (
          <View style={{ gap: space[2] }}>
            {rows.map((row) => (
              <UnitRow
                key={row.id}
                ref={(view) => {
                  if (view) rowRefs.current.set(row.id, view)
                  else rowRefs.current.delete(row.id)
                }}
                row={row}
                benchmark={path.benchmark}
                onPress={() => open(row.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

// First load only: five unit rows (node and card). Static and hidden from TalkBack.
function Skeleton() {
  const { colors, space, radius, sizes } = useTheme()
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: space[2] }}>
      {[0, 1, 2, 3, 4].map((index) => (
        <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: sizes.target }}>
          <View style={{ width: space[8], height: space[8], borderRadius: radius.full, backgroundColor: colors.surfaceSunken }} />
          <View style={{ flex: 1, height: sizes.topbarH + space[4], borderRadius: radius.md, backgroundColor: colors.surfaceSunken }} />
        </View>
      ))}
    </View>
  )
}
