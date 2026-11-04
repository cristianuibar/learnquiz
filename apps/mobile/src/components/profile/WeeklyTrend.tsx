import { useState } from 'react'
import { View } from 'react-native'
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg'
import type { Profile } from '@learnquiz/api/progress'
import { percentText, trendGeometry } from '@/lib/profile-progress'
import { useTheme } from '@/theme/ThemeProvider'
import { Card } from '../ui/Card'
import { Text } from '../ui/Text'

export function WeeklyTrend({ profile }: { profile: Profile }) {
  const { colors, space, typography } = useTheme()
  const [width, setWidth] = useState(294)
  const chart = trendGeometry(profile.weeks, profile.benchmark, profile.proficiency.achievedAt === null ? profile.proficiency.projectedAt : null, width)
  const last = chart.points[chart.points.length - 1]
  const font = { fontSize: typography.overline.fontSize, fontFamily: typography.caption.fontFamily }
  const strongFont = { ...font, fontFamily: typography.label.fontFamily }
  const ticks = [
    { value: 1, y: chart.top },
    { value: profile.benchmark, y: chart.benchmarkY },
    { value: 0.5, y: (chart.top + chart.bottom) / 2 },
    { value: 0, y: chart.bottom },
  ]
  return (
    <View style={{ gap: space[3] }}>
      <Text header variant="title3">Weekly trend</Text>
      <Card style={{ gap: space[3] }}>
        <View onLayout={(event) => setWidth(Math.max(1, event.nativeEvent.layout.width))}
          accessible accessibilityRole="image" accessibilityLabel={chart.description}>
          <Svg width="100%" height={chart.height} viewBox={`0 0 ${width} ${chart.height}`}
            accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {[chart.top, (chart.top + chart.bottom) / 2, chart.bottom].map((y) => (
              <Line key={y} x1={chart.left} x2={chart.right} y1={y} y2={y} stroke={colors.border} strokeWidth={1} />
            ))}
            <Line x1={chart.left} x2={chart.right} y1={chart.benchmarkY} y2={chart.benchmarkY}
              stroke={colors.inkMuted} strokeWidth={2} strokeDasharray="4 4" />
            {ticks.map(({ value, y }, index) => (
              <SvgText key={index} x={chart.left - space[2]} y={y + space[1]} textAnchor="end"
                {...(index === 1 ? strongFont : font)} fill={index === 1 ? colors.ink : colors.inkMuted}>
                {percentText(value)}
              </SvgText>
            ))}
            <Polyline points={chart.points.map(({ x, y }) => `${x},${y}`).join(' ')}
              fill="none" stroke={colors.brand} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {chart.projection && last && (
              <>
                <Line x1={last.x} y1={last.y} x2={chart.projection.x} y2={chart.projection.y}
                  stroke={colors.brand} strokeWidth={2} strokeLinecap="round" strokeDasharray="6 6" />
                <Circle cx={chart.projection.x} cy={chart.projection.y} r={4} fill={colors.surfacePage} stroke={colors.brand} strokeWidth={2} />
                <SvgText x={chart.projection.x} y={164} {...font} textAnchor="middle" fill={colors.inkMuted}>{chart.projection.dateLabel}</SvgText>
              </>
            )}
            {chart.points.map((point) => (
              <Circle key={point.start} cx={point.x} cy={point.y} r={5} fill={colors.brand} stroke={colors.surfacePage} strokeWidth={2} />
            ))}
            {chart.points.map((point) => (
              <SvgText key={point.start} x={point.x} y={Math.max(typography.overline.fontSize, point.y - space[3])}
                {...strongFont} textAnchor="middle" fill={colors.ink}>{point.valueLabel}</SvgText>
            ))}
            {chart.points.map((point) => (
              <SvgText key={point.start} x={point.x} y={164} {...strongFont} textAnchor="middle" fill={colors.ink}>{point.dateLabel}</SvgText>
            ))}
            <SvgText x={chart.left - space[2]} y={182} {...font} textAnchor="end" fill={colors.inkMuted}>Sessions</SvgText>
            {chart.points.map((point) => (
              <SvgText key={point.start} x={point.x} y={182} {...font} textAnchor="middle" fill={colors.inkMuted}>
                {point.sessions}{point.partial ? ' so far' : ''}
              </SvgText>
            ))}
          </Svg>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
          {[
            { label: 'Measured', color: colors.brand, dash: undefined },
            ...(chart.projection && last ? [{ label: 'Projected', color: colors.brand, dash: '6 6' }] : []),
            { label: `Benchmark ${percentText(profile.benchmark)}`, color: colors.inkMuted, dash: '4 4' },
          ].map(({ label, color, dash }) => (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
              <Svg width={space[6]} height={space[3]} accessible={false}>
                <Line x1={0} x2={space[6]} y1={space[1]} y2={space[1]} stroke={color} strokeWidth={2} strokeDasharray={dash} />
              </Svg>
              <Text variant="caption" muted>{label}</Text>
            </View>
          ))}
        </View>
      </Card>
    </View>
  )
}
