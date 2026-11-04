import type { RefObject } from 'react'
import { View, type Text as NativeText } from 'react-native'
import type { TopicPath } from '@learnquiz/api/progress'
import { headerLine, roleBarText } from '@/lib/path'
import { useTheme } from '@/theme/ThemeProvider'
import { Bar } from '../ui/Bar'
import { Text } from '../ui/Text'

export type PathHeaderProps = {
  title: string | null
  path: Pick<TopicPath, 'mastery' | 'benchmark' | 'onboarding'> | null
  headingRef: RefObject<NativeText | null>
}

// The role name, mastery against the benchmark, and the role bar. The heading
// is always mounted so arrival focus has a target; until a title is known it
// reads "Path" and is visually hidden.
export function PathHeader({ title, path, headingRef }: PathHeaderProps) {
  const { colors, space, radius } = useTheme()
  return (
    <View style={{ gap: space[3] }}>
      <View style={{ gap: space[1] }}>
        {/* One element, so focus stays put when the title arrives. Hidden, it is
            still visible to TalkBack, which skips views with zero opacity. */}
        <Text
          ref={headingRef}
          header
          variant="title1"
          style={title ? undefined : { position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'hidden', color: colors.surfacePage }}
        >
          {title ?? 'Path'}
        </Text>
        {path ? (
          <Text variant="body" muted num>{headerLine(path)}</Text>
        ) : (
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: space[2] }}>
            {!title && <View style={{ height: space[8], width: '70%', borderRadius: radius.md, backgroundColor: colors.surfaceSunken }} />}
            <View style={{ height: space[6] - space[1], width: '60%', borderRadius: radius.md, backgroundColor: colors.surfaceSunken }} />
          </View>
        )}
      </View>
      {path ? (
        <Bar
          value={path.mastery * 100}
          benchmark={path.benchmark * 100}
          accessibilityLabel="Role mastery"
          accessibilityValue={{ text: roleBarText(path) }}
        />
      ) : (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: space[2], borderRadius: radius.full, backgroundColor: colors.surfaceSunken }} />
      )}
    </View>
  )
}
