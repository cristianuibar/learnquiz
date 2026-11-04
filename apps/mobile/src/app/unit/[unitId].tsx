import { useCallback, useEffect, useRef } from 'react'
import { AccessibilityInfo, findNodeHandle, ScrollView, View, type Text as NativeText } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, FileText } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { networkError } from '@learnquiz/api/system-copy'
import { AlertRow } from '@/components/ui/AlertRow'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IconButton } from '@/components/ui/IconButton'
import { RetryIcon } from '@/components/ui/icons'
import { Text } from '@/components/ui/Text'
import { ConceptRow } from '@/components/unit/ConceptRow'
import { Procedure } from '@/components/unit/Procedure'
import { UnitBar } from '@/components/unit/UnitBar'
import { getToken } from '@/lib/auth'
import { pathError } from '@/lib/path'
import { useTopicPath } from '@/lib/topic-path'
import { useUnitProcedure } from '@/lib/unit-procedure'
import { canPractice, conceptRows, findUnit, notFoundText, practiceLabel, practiceParams, sourceCaption, unitMastery, unitRouteParams } from '@/lib/unit'
import { useTheme } from '@/theme/ThemeProvider'

// Unit detail: one unit of the same /topics/:topicId/path payload Path shows.
// No tab bar; Back returns to Path, which puts focus back on this unit's row.
export default function UnitScreen() {
  const { unitId, topicId } = unitRouteParams(useLocalSearchParams<{ unitId?: string | string[]; topicId?: string | string[] }>())
  const { path, status, owner, retry } = useTopicPath(topicId)
  const { colors, space, radius, sizes } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const heading = useRef<NativeText>(null)

  const unit = path ? findUnit(path, unitId) : null
  const procedure = useUnitProcedure(unit?.id ?? null)
  const missing = topicId === null || unitId === null || (path !== null && unit === null)
  const failed = !missing && (status === 'offline' || status === 'error')
  const title = unit?.name ?? (missing ? notFoundText : null)

  // The H1 exists only once the unit (or Not found) is known, so focus it when
  // it appears rather than on mount as useHeadingFocus would.
  const titled = title !== null
  useEffect(() => {
    if (!titled) return
    const frame = requestAnimationFrame(() => {
      const tag = heading.current && findNodeHandle(heading.current)
      if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag)
    })
    return () => cancelAnimationFrame(frame)
  }, [titled])

  const back = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)/path')
  }, [router])

  const practice = useCallback(() => {
    // Only a path fetched under the current token may start a session.
    if (!path || !unit || owner === null || owner !== getToken()) return
    const params = practiceParams(path.topic.id, unit)
    if (params) router.push({ pathname: '/play/loading', params })
  }, [path, unit, owner, router])

  const rows = unit && path ? conceptRows(unit, path.benchmark) : []
  const caption = unit ? sourceCaption(unit.source) : null
  const bottom = Math.max(space[2], insets.bottom)

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfacePage, paddingLeft: insets.left, paddingRight: insets.right }}>
      <View style={{
        paddingTop: insets.top,
        minHeight: sizes.topbarH + insets.top,
        paddingHorizontal: space[2],
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
      }}>
        <IconButton icon={ChevronLeft} accessibilityLabel="Back to Path" onPress={back} />
        {title !== null ? (
          <Text ref={heading} header variant="title2" style={{ flex: 1 }}>{title}</Text>
        ) : !failed && (
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: space[12] * 3, height: space[6], borderRadius: radius.sm, backgroundColor: colors.surfaceSunken }} />
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: space[2], paddingHorizontal: space[4], paddingBottom: unit ? space[6] : space[6] + bottom, gap: space[8] }}
      >
        {failed && (
          <View style={{ gap: space[3] }}>
            <AlertRow>{status === 'offline' ? networkError : pathError}</AlertRow>
            <Button variant="secondary" icon={RetryIcon} onPress={retry}>Try again</Button>
          </View>
        )}
        {missing ? (
          <Button variant="secondary" onPress={back}>Back to Path</Button>
        ) : !unit || !path ? (
          !failed && (
            <>
              <Skeleton />
              <View accessible role="status" accessibilityLiveRegion="polite">
                <Text variant="label" muted>Loading this unit</Text>
              </View>
            </>
          )
        ) : (
          <>
            <UnitBar mastery={unitMastery(unit, path.benchmark)} />
            <View style={{ gap: space[2] }}>
              <Text header variant="title3">Concepts</Text>
              {rows.length > 0 && (
                <Card style={{ paddingVertical: 0 }}>
                  {rows.map((row, index) => (
                    <ConceptRow key={row.id} row={row} benchmark={Math.round(path.benchmark * 100)} first={index === 0} />
                  ))}
                </Card>
              )}
              {caption !== null && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1], paddingHorizontal: space[4], paddingTop: space[2] }}>
                  <FileText size={space[4]} strokeWidth={2} color={colors.inkMuted} accessible={false} />
                  <Text variant="caption" muted style={{ flexShrink: 1 }}>{caption}</Text>
                </View>
              )}
            </View>
            {procedure && <Procedure graph={procedure.graph} source={procedure.source} />}
          </>
        )}
      </ScrollView>

      {unit && (
        <View style={{
          paddingTop: space[3],
          paddingHorizontal: space[4],
          paddingBottom: space[3] + bottom,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surfacePage,
        }}>
          <Button size="lg" disabled={!canPractice(unit)} onPress={practice}>{practiceLabel(unit)}</Button>
        </View>
      )}
    </View>
  )
}

// First load only: the mastery block and a concepts card. Static and hidden from TalkBack.
function Skeleton() {
  const { colors, space, radius, sizes } = useTheme()
  const block = (height: number, width: number | `${number}%` = '100%') => ({ height, width, borderRadius: radius.sm, backgroundColor: colors.surfaceSunken })
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: space[8] }}>
      <View style={{ gap: space[3] }}>
        <View style={block(space[8] + space[1], '50%')} />
        <View style={[block(space[3]), { borderRadius: radius.full }]} />
      </View>
      <View style={{ gap: space[2] }}>
        <View style={block(space[6], '30%')} />
        <View style={{ height: sizes.topbarH * 5, borderRadius: radius.md, backgroundColor: colors.surfaceSunken }} />
      </View>
    </View>
  )
}
