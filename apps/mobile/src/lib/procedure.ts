import type { ProcedureGraph, ProcedureLayout, UnitProcedure } from '@learnquiz/api/procedure'

// Source metadata is optional for compatibility with older API deployments.
export type ProcedureResult = ({ status: 'ready'; graph: ProcedureGraph; source?: Partial<UnitProcedure['source']> | null }) | { status: 'pending' } | null

export function procedureCaption(source?: Partial<UnitProcedure['source']> | null): string | null {
  return source?.title?.trim() && source.version != null ? `${source.title} · v${source.version}` : null
}

export function visibleProcedure(result: ProcedureResult) {
  return result?.status === 'ready' && result.graph.nodes.length > 0 ? result : null
}

type TextMetrics = { fontSize: number; lineHeight: number; padding: number; shieldSize: number }

// SVG text does not wrap or inherit Android font scaling. Use a conservative
// character width, splitting long words too, and grow nodes instead of clipping.
function wrapLabel(label: string, width: number, fontSize: number): string[] {
  const limit = Math.max(1, Math.floor(width / (fontSize * 0.7)))
  const lines: string[] = []
  let line = ''
  for (const word of label.trim().split(/\s+/)) {
    if (line && line.length + word.length + 1 > limit) { lines.push(line); line = '' }
    let rest = word
    while (rest.length > limit) { lines.push(rest.slice(0, limit)); rest = rest.slice(limit) }
    line = line ? `${line} ${rest}` : rest
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

// Presentation only: shared layoutProcedure owns traversal, columns and layers.
// Preserve its horizontal positions; expand layer heights for wrapped SVG text.
export function procedureViewModel(layout: ProcedureLayout, metrics: TextMetrics) {
  const { padding, shieldSize, fontSize, lineHeight } = metrics
  const sizes = layout.nodes.map((node) => {
    const inset = padding * 2 + (node.critical ? shieldSize + padding : 0)
    const lines = wrapLabel(node.label, node.width / (node.kind === 'decision' ? 2 : 1) - inset, fontSize)
    const height = Math.max(node.height, (lines.length * lineHeight + padding * 2) * (node.kind === 'decision' ? 2 : 1))
    return { ...node, lines, height }
  })
  const layers = [...new Set(sizes.map((n) => n.layer))].sort((a, b) => a - b)
  const tops = new Map<number, number>()
  let bottom = padding
  for (const layer of layers) {
    const original = layout.nodes.find((n) => n.layer === layer)!
    const previousLayer = layers[layers.indexOf(layer) - 1]
    const previous = layout.nodes.find((n) => n.layer === previousLayer)
    const gap = previous ? original.y - original.height / 2 - (previous.y + previous.height / 2) : 0
    const top = bottom + gap
    tops.set(layer, top)
    bottom = top + Math.max(...sizes.filter((n) => n.layer === layer).map((n) => n.height))
  }
  const nodes = sizes.map((node) => ({ ...node, x: node.x + padding, y: tops.get(node.layer)! + node.height / 2 }))
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const edges = layout.edges.map((edge) => {
    const from = byId.get(edge.from)!
    const to = byId.get(edge.to)!
    const start = { x: from.x, y: from.y + from.height / 2 }
    const end = { x: to.x, y: to.y - to.height / 2 }
    const middle = (start.y + end.y) / 2
    const points = edge.back
      ? [start, { x: start.x, y: start.y + padding }, { x: padding / 2, y: start.y + padding }, { x: padding / 2, y: end.y - padding }, { x: end.x, y: end.y - padding }, end]
      : [start, { x: start.x, y: middle }, { x: end.x, y: middle }, end]
    return { ...edge, points, path: points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' '), labelX: (start.x + end.x) / 2, labelY: edge.back ? start.y + padding : middle }
  })
  return { width: layout.width + padding * 2, height: bottom + padding, nodes, edges }
}
