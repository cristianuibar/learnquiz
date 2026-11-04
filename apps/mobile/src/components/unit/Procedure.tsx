import { useMemo, useState } from 'react'
import { View, useWindowDimensions } from 'react-native'
import Svg, { G, Path, Polygon, Rect, Circle, Text as SvgText, TSpan } from 'react-native-svg'
import { FileText } from 'lucide-react-native'
import { describeProcedure, layoutProcedure, type ProcedureGraph } from '@learnquiz/api/procedure'
import { Card } from '@/components/ui/Card'
import { Text } from '@/components/ui/Text'
import { procedureCaption, procedureViewModel } from '@/lib/procedure'
import { useTheme } from '@/theme/ThemeProvider'

type Props = { graph: ProcedureGraph; source?: { title?: string; version?: number } | null }

export function Procedure({ graph, source }: Props) {
  const { colors, space, radius, typography } = useTheme()
  const window = useWindowDimensions()
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null)
  const width = Math.max(1, measuredWidth ?? window.width - space[4] * 4)
  const fontSize = typography.caption.fontSize * window.fontScale
  const lineHeight = typography.caption.lineHeight * window.fontScale
  const model = useMemo(() => procedureViewModel(layoutProcedure(graph, Math.max(1, width - space[2] * 2)), {
    fontSize, lineHeight, padding: space[2], shieldSize: space[4],
  }), [graph, width, fontSize, lineHeight, space])
  const caption = procedureCaption(source)

  return (
    <View style={{ gap: space[2] }}>
      <Text header variant="title3">Procedure</Text>
      <Card style={{ gap: space[2] }}>
        <View
          accessible accessibilityRole="image" accessibilityLabel={describeProcedure(graph)}
          onLayout={(event) => { const next = event.nativeEvent.layout.width; if (next > 0) setMeasuredWidth(next) }}
          style={{ width: '100%', aspectRatio: model.width / model.height }}
        >
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flex: 1 }}>
            <Svg width="100%" height="100%" viewBox={`0 0 ${model.width} ${model.height}`} accessible={false}>
              {model.edges.map((edge, index) => {
                const end = edge.points[edge.points.length - 1]!
                return (
                  <G key={`${edge.from}-${edge.to}-${index}`}>
                    <Path d={edge.path} fill="none" stroke={colors.borderStrong} strokeWidth={1.5} strokeLinejoin="round" />
                    <Path d={`M${end.x - 4} ${end.y - 5} L${end.x} ${end.y} L${end.x + 4} ${end.y - 5}`} fill="none" stroke={colors.borderStrong} strokeWidth={1.5} />
                    {edge.label && <SvgText x={edge.labelX} y={edge.labelY - space[1]} textAnchor="middle" fontFamily={typography.caption.fontFamily} fontSize={fontSize} fill={colors.inkMuted}>{edge.label === 'yes' ? 'Yes' : 'No'}</SvgText>}
                  </G>
                )
              })}
              {model.nodes.map((node) => {
                const left = node.x - node.width / 2
                const top = node.y - node.height / 2
                const stroke = node.critical ? colors.ink : colors.borderStrong
                const fill = node.critical ? colors.surfaceSunken : colors.surfaceCard
                const shieldInset = node.kind === 'decision' ? node.width / 4 : 0
                const labelX = node.x + (node.critical ? (space[4] + space[2]) / 2 : 0)
                return (
                  <G key={node.id}>
                    {node.kind === 'decision' ? (
                      <Polygon points={`${node.x},${top} ${left + node.width},${node.y} ${node.x},${top + node.height} ${left},${node.y}`} fill={fill} stroke={stroke} strokeWidth={node.critical ? 2 : 1.5} />
                    ) : (
                      <Rect x={left} y={top} width={node.width} height={node.height} rx={radius.md} fill={fill} stroke={stroke} strokeWidth={node.critical ? 2 : 1.5} />
                    )}
                    {node.critical && (
                      <G transform={`translate(${left + shieldInset + space[2]}, ${node.y - space[2]}) scale(${space[4] / 24})`}>
                        <Path d="M12 3l7 3v5c0 4.6-3 8.3-7 10-4-1.7-7-5.4-7-10V6z" fill="none" stroke={colors.ink} strokeWidth={2} strokeLinejoin="round" />
                        <Circle cx={12} cy={11.5} r={1.5} fill={colors.ink} />
                      </G>
                    )}
                    <SvgText x={labelX} y={node.y - (node.lines.length - 1) * lineHeight / 2 + fontSize * 0.35} textAnchor="middle" fontFamily={typography.caption.fontFamily} fontSize={fontSize} fill={colors.ink}>
                      {node.lines.map((line, index) => <TSpan key={index} x={labelX} dy={index === 0 ? 0 : lineHeight}>{line}</TSpan>)}
                    </SvgText>
                  </G>
                )
              })}
            </Svg>
          </View>
        </View>
        {caption !== null && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
            <FileText size={space[4]} color={colors.inkMuted} accessible={false} />
            <Text variant="caption" muted style={{ flexShrink: 1 }}>{caption}</Text>
          </View>
        )}
      </Card>
    </View>
  )
}
