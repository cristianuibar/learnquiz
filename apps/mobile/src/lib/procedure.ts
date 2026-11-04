import { describeProcedure, layoutProcedure, NODE_WIDTH, type ProcedureGraph, type ProcedureLayout, type UnitProcedure } from '@learnquiz/api/procedure'

// Source metadata is optional for compatibility with older API deployments.
export type ProcedureResult = ({ status: 'ready'; graph: ProcedureGraph; source?: Partial<UnitProcedure['source']> | null }) | { status: 'pending' } | null

export function procedureCaption(source?: Partial<UnitProcedure['source']> | null): string | null {
  return source?.title?.trim() && source.version != null ? `${source.title} · v${source.version}` : null
}

export function visibleProcedure(result: ProcedureResult) {
  return result?.status === 'ready' && result.graph.nodes.length > 0 ? result : null
}

type TextMetrics = { fontSize: number; lineHeight: number; padding: number; shieldSize: number }

// Inter caption averages about .58 em; .6 leaves a small safety margin.
const CHAR_EM = 0.6
export const MAX_PROCEDURE_FONT_SCALE = 1.5
export const MAX_PROCEDURE_WINDOW_HEIGHT = 1.5
export const MAX_PROCEDURE_SVG_HEIGHT = 1200

function wrapLabel(label: string, width: number, fontSize: number): string[] {
  const limit = Math.floor(width / (fontSize * CHAR_EM))
  // Below six characters even hyphenated words become unreadable. The render
  // policy will choose native text instead of drawing these overflowing lines.
  if (limit < 6) return [label]
  const parts = label.trim().split(/\s+/).flatMap((word) => {
    const chunks: string[] = []
    let rest = word
    while (rest.length > limit) {
      // Keep at least three letters on both sides of a word break.
      const take = Math.min(limit - 1, rest.length - 3)
      chunks.push(`${rest.slice(0, take)}-`)
      rest = rest.slice(take)
    }
    return [...chunks, rest]
  })
  const lines: string[] = []
  let line = ''
  for (const part of parts) {
    if (line && line.length + part.length + 1 > limit) { lines.push(line); line = '' }
    line = line ? `${line} ${part}` : part
    if (part.endsWith('-') && part.length === limit) { lines.push(line); line = '' }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

// Shared layout owns traversal, columns and layers. Only presentation sizes
// change here: singleton nodes can use their free horizontal space, and the
// mobile design uses 40 dp steps with 24 dp gaps rather than desktop spacing.
export function procedureViewModel(layout: ProcedureLayout, metrics: TextMetrics) {
  const { padding, shieldSize, fontSize, lineHeight } = metrics
  const sizes = layout.nodes.map((node) => {
    const peers = layout.nodes.filter((n) => n.layer === node.layer && n.id !== node.id)
    const available = Math.min(node.x * 2, (layout.width - node.x) * 2, ...peers.map((n) => Math.abs(n.x - node.x))) - padding
    const width = Math.max(node.width, Math.min(NODE_WIDTH, available))
    const shield = node.critical ? shieldSize + padding : 0
    const textWidth = node.kind === 'decision' ? width * 0.7 - shield : width - padding * 2 - shield
    const lines = wrapLabel(node.label, textWidth, fontSize)
    const textHeight = lines.length * lineHeight
    // .7 of a diamond's width is available in the central .3 of its height.
    const height = node.kind === 'decision'
      ? Math.max(56, (textHeight + padding) / 0.3)
      : Math.max(40, textHeight + padding * 2)
    const fits = lines.every((line) => line.length * fontSize * CHAR_EM <= textWidth)
    return { ...node, width, lines, height, fits, textWidth }
  })
  const layers = [...new Set(sizes.map((n) => n.layer))].sort((a, b) => a - b)
  const tops = new Map<number, number>()
  let bottom = padding
  for (const layer of layers) {
    const top = bottom + (tops.size ? padding * 3 : 0)
    tops.set(layer, top)
    bottom = top + Math.max(...sizes.filter((n) => n.layer === layer).map((n) => n.height))
  }
  const nodes = sizes.map((node) => ({ ...node, y: tops.get(node.layer)! + node.height / 2 }))
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const edges = layout.edges.map((edge) => {
    const from = byId.get(edge.from)!
    const to = byId.get(edge.to)!
    const side = from.kind === 'decision' && edge.label !== null ? (edge.label === 'yes' ? -1 : 1) : 0
    const start = side ? { x: from.x + side * from.width / 2, y: from.y } : { x: from.x, y: from.y + from.height / 2 }
    const end = { x: to.x, y: to.y - to.height / 2 }
    const middle = (start.y + end.y) / 2
    const points = edge.back
      ? [start, { x: start.x, y: start.y + padding }, { x: padding / 2, y: start.y + padding }, { x: padding / 2, y: end.y - padding }, { x: end.x, y: end.y - padding }, end]
      : side ? [start, { x: end.x, y: start.y }, end]
        : [start, { x: start.x, y: middle }, { x: end.x, y: middle }, end]
    return { ...edge, points, path: points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' '),
      labelX: side ? start.x + side * padding : (start.x + end.x) / 2,
      labelY: side ? start.y : edge.back ? start.y + padding : middle,
      labelAnchor: side === -1 ? 'end' as const : side === 1 ? 'start' as const : 'middle' as const }
  })
  // Back-edge bends need space beyond the last node, plus a stroke margin.
  const pathBottom = Math.max(bottom, ...edges.flatMap((e) => e.points.map((p) => p.y)))
  return { width: layout.width, height: pathBottom + padding, nodes, edges }
}

// Never mount an SVG whose bitmap could exceed this viewport budget. Retry
// with Profile's 1.5x text cap, then use native scalable text if it still fails.
export function procedurePresentation(graph: ProcedureGraph, width: number, fontScale: number, windowHeight: number, metrics: TextMetrics) {
  const steps = describeProcedure(graph).split('\n')
  const text = { kind: 'text' as const, steps }
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(windowHeight) || windowHeight <= 0) return text
  const maxHeight = Math.min(windowHeight * MAX_PROCEDURE_WINDOW_HEIGHT, MAX_PROCEDURE_SVG_HEIGHT)
  const scale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1
  const layout = layoutProcedure(graph, width)
  for (const nextScale of [...new Set([scale, Math.min(scale, MAX_PROCEDURE_FONT_SCALE)])]) {
    const fontSize = metrics.fontSize * nextScale
    const lineHeight = metrics.lineHeight * nextScale
    const model = procedureViewModel(layout, { ...metrics, fontSize, lineHeight })
    if (model.height <= maxHeight && model.nodes.every((node) => node.fits)) {
      return { kind: 'svg' as const, model, fontSize, lineHeight, fontScale: nextScale }
    }
  }
  return text
}
