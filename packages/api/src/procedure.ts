export type ProcedureNode = { id: string; kind: 'step' | 'decision'; label: string; critical: boolean }
export type ProcedureEdge = { from: string; to: string; label: 'yes' | 'no' | null }
export type ProcedureGraph = { nodes: ProcedureNode[]; edges: ProcedureEdge[] }
export type UnitProcedure = { graph: ProcedureGraph; source: { title: string; version: number } }

export const NODE_WIDTH = 160
export const NODE_HEIGHT = 56
export const COLUMN_GAP = 16
export const LAYER_GAP = 48

export type PositionedNode = ProcedureNode & { x: number; y: number; width: number; height: number; layer: number }
export type PositionedEdge = ProcedureEdge & { points: { x: number; y: number }[]; back: boolean }
export type ProcedureLayout = { width: number; height: number; nodes: PositionedNode[]; edges: PositionedEdge[] }

// Traversal order: BFS from the roots, so a loop-back edge never pushes a node further down.
function traverse(graph: ProcedureGraph) {
  const out = new Map<string, ProcedureEdge[]>()
  const hasIncoming = new Set<string>()
  for (const node of graph.nodes) out.set(node.id, [])
  for (const edge of graph.edges) {
    if (!out.has(edge.from) || !out.has(edge.to)) continue
    out.get(edge.from)!.push(edge)
    hasIncoming.add(edge.to)
  }
  const rank = (e: ProcedureEdge) => (e.label === 'yes' ? 0 : e.label === 'no' ? 1 : 2)
  for (const edges of out.values()) edges.sort((a, b) => rank(a) - rank(b))
  let roots = graph.nodes.filter((n) => !hasIncoming.has(n.id)).map((n) => n.id)
  if (roots.length === 0 && graph.nodes.length > 0) roots = [graph.nodes[0]!.id]

  // Each node keeps its column offset from the parent that placed it; layout resolves it after spreading the parent's layer.
  const layer = new Map<string, number>()
  const parent = new Map<string, string>()
  const offset = new Map<string, number>()
  const order: string[] = []
  const seed = (id: string) => {
    layer.set(id, 0)
    offset.set(id, 0)
    const queue = [id]
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i]!
      order.push(current)
      const node = graph.nodes.find((n) => n.id === current)!
      const edges = out.get(current)!
      edges.forEach((edge, index) => {
        if (layer.has(edge.to)) return
        let shift = 0
        if (node.kind === 'decision' && edges.length > 1) {
          shift = edge.label === 'yes' ? -1 : edge.label === 'no' ? 1 : index === 0 ? -1 : 1
        }
        layer.set(edge.to, layer.get(current)! + 1)
        parent.set(edge.to, current)
        offset.set(edge.to, shift)
        queue.push(edge.to)
      })
    }
  }
  for (const id of roots) if (!layer.has(id)) seed(id)
  for (const node of graph.nodes) if (!layer.has(node.id)) seed(node.id)
  return { out, layer, parent, offset, order }
}

export function layoutProcedure(graph: ProcedureGraph, width: number): ProcedureLayout {
  const { out, layer, parent, offset, order } = traverse(graph)
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const byLayer = new Map<number, string[]>()
  for (const id of order) {
    const l = layer.get(id)!
    byLayer.set(l, [...(byLayer.get(l) ?? []), id])
  }
  const column = new Map<string, number>()
  for (const l of [...byLayer.keys()].sort((a, b) => a - b)) {
    const ids = byLayer.get(l)!
    for (const id of ids) {
      const from = parent.get(id)
      column.set(id, (from === undefined ? 0 : column.get(from)!) + offset.get(id)!)
    }
    // A branch that lands in its decision's own layer still sits on its side: yes left, no right.
    const side = new Map<string, number>()
    for (const id of ids) {
      if (byId.get(id)!.kind !== 'decision') continue
      for (const edge of out.get(id)!) {
        if (edge.label && layer.get(edge.to) === l) {
          side.set(edge.to, edge.label === 'yes' ? -0.5 : 0.5)
        }
      }
    }
    const key = (id: string) => column.get(id)! + (side.get(id) ?? 0)
    const sorted = [...ids].sort((a, b) => key(a) - key(b) || ids.indexOf(a) - ids.indexOf(b))
    let last = -Infinity
    for (const id of sorted) {
      const col = Math.max(column.get(id)!, last + 1)
      column.set(id, col)
      last = col
    }
  }

  const cols = [...column.values()]
  const minCol = cols.length ? Math.min(...cols) : 0
  const span = cols.length ? Math.max(...cols) - minCol : 0
  const step = Math.min(NODE_WIDTH + COLUMN_GAP, width / (span + 1))
  const nodeWidth = Math.max(1, Math.min(NODE_WIDTH, step - 8, width))
  const start = (width - (step * span + nodeWidth)) / 2 + nodeWidth / 2
  const layers = byLayer.size ? Math.max(...byLayer.keys()) + 1 : 0

  const nodes: PositionedNode[] = graph.nodes.map((node) => ({
    ...node,
    layer: layer.get(node.id)!,
    x: start + step * (column.get(node.id)! - minCol),
    y: NODE_HEIGHT / 2 + layer.get(node.id)! * (NODE_HEIGHT + LAYER_GAP),
    width: nodeWidth,
    height: NODE_HEIGHT,
  }))
  const at = new Map(nodes.map((n) => [n.id, n]))
  const edges: PositionedEdge[] = graph.edges.flatMap((edge) => {
    const from = at.get(edge.from)
    const to = at.get(edge.to)
    if (!from || !to) return []
    const back = to.layer <= from.layer
    const points = [{ x: from.x, y: from.y + NODE_HEIGHT / 2 }, { x: to.x, y: to.y - NODE_HEIGHT / 2 }]
    return [{ ...edge, points, back }]
  })
  const height = layers ? layers * NODE_HEIGHT + (layers - 1) * LAYER_GAP : 0
  return { width, height, nodes, edges }
}

export function describeProcedure(graph: ProcedureGraph): string {
  const { out, order, layer } = traverse(graph)
  const number = new Map(order.map((id, i) => [id, i + 1]))
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const target = (id: string) => `step ${number.get(id)}, ${byId.get(id)!.label}`
  const destination = (edge: ProcedureEdge) => layer.get(edge.to)! <= layer.get(edge.from)!
    ? `go back to: ${byId.get(edge.to)!.label}`
    : `go to ${target(edge.to)}`
  const lines = order.map((id) => {
    const node = byId.get(id)!
    const edges = out.get(id)!
    const mark = node.critical ? ' (critical step)' : ''
    const rest = edges.map((edge) => `${edge.label ? `If ${edge.label},` : 'Then'} ${destination(edge)}.`).join(' ')
    if (node.kind === 'decision') {
      const question = node.label.endsWith('?') ? node.label : `${node.label}?`
      return `${number.get(id)}. ${question}${mark} ${rest}`.trim()
    }
    return `${number.get(id)}. ${node.label}${mark}.${rest ? ` ${rest}` : ''}`
  })
  return lines.join('\n')
}
