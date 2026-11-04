import { useState } from 'react'
import { useWindowDimensions, View } from 'react-native'
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg'
import type { Profile } from '@learnquiz/api/progress'
import { percentText, trendGeometry } from '@/lib/profile-progress'
import { useTheme } from '@/theme/ThemeProvider'
import { Card } from '../ui/Card'
import { Text } from '../ui/Text'

export function WeeklyTrend({ profile }: { profile: Profile }) {
  const { colors, space, typography } = useTheme()
  // react-native-svg scales text by density only; size labels from the font scale.
  const { fontScale } = useWindowDimensions()
  const [width, setWidth] = useState(294)
  const chart = trendGeometry(profile.weeks, profile.benchmark, profile.proficiency.achievedAt === null ? profile.proficiency.projectedAt : null, width, fontScale)
  const last = chart.points[chart.points.length - 1]
  const { type } = chart
  const font = { fontSize: type.font, fontFamily: typography.body.fontFamily }
  const strongFont = { ...font, fontFamily: typography.overline.fontFamily }
  const tickOffset = Math.round(type.font / 3)
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
          accessible accessibilityRole="image" accessibilityLabel={chart.description} style={{ minHeight: chart.height }}>
          <Svg width="100%" height={chart.height} viewBox={`0 0 ${width} ${chart.height}`}
            accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {[chart.top, (chart.top + chart.bottom) / 2, chart.bottom].map((y) => (
              <Line key={y} x1={chart.left} x2={chart.width} y1={y} y2={y} stroke={colors.border} strokeWidth={1} />
            ))}
            <Line x1={chart.left} x2={chart.width} y1={chart.benchmarkY} y2={chart.benchmarkY}
              stroke={colors.inkMuted} strokeWidth={2} strokeDasharray="4 4" />
            {ticks.map(({ value, y }, index) => (
              <SvgText key={index} x={chart.left - space[2]} y={y + tickOffset} textAnchor="end"
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
                <Circle cx={chart.projection.x} cy={chart.projection.y} r={4} fill={colors.surfaceCard} stroke={colors.brand} strokeWidth={2} />
                <SvgText x={chart.projection.date.x} y={type.dateY} {...font} textAnchor="middle" fill={colors.inkMuted}>{chart.projection.dateLabel}</SvgText>
              </>
            )}
            {chart.points.map((point) => (
              <Circle key={point.start} cx={point.x} cy={point.y} r={5} fill={colors.brand} stroke={colors.surfaceCard} strokeWidth={2} />
            ))}
            {chart.points.map((point) => point.valued && (
              <SvgText key={point.start} x={point.value.x} y={point.value.y}
                {...strongFont} textAnchor="middle" fill={colors.ink}>{point.valueLabel}</SvgText>
            ))}
            {chart.points.map((point) => point.dated && (
              <SvgText key={point.start} x={point.date.x} y={type.dateY} {...strongFont} textAnchor="middle" fill={colors.ink}>{point.dateLabel}</SvgText>
            ))}
            <SvgText x={chart.left - space[2]} y={type.sessionsY} fontSize={type.label} fontFamily={typography.caption.fontFamily}
              textAnchor="end" fill={colors.inkMuted}>Sessions</SvgText>
            {chart.points.map((point) => point.counted && (
              <SvgText key={point.start} x={point.count.x} y={type.sessionsY} {...font} textAnchor="middle" fill={colors.ink}>
                {point.count.text}
              </SvgText>
            ))}
            {chart.points.map((point) => point.counted && point.count.suffixX !== null && (
              <SvgText key={point.start} x={point.count.suffixX} y={type.sessionsY} {...font} textAnchor="start" fill={colors.inkMuted}>
                so far
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
