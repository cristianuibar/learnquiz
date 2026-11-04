import { describeProcedure, layoutProcedure, type ProcedureGraph } from '@learnquiz/api/procedure'
import { procedureCaption, procedureViewModel, visibleProcedure } from './procedure'

const graph: ProcedureGraph = {
  nodes: [
    { id: 'inspect', label: 'Is the pallet damaged', kind: 'decision', critical: false },
    { id: 'record', label: 'Photograph the damage and note it on the delivery receipt', kind: 'step', critical: true },
    { id: 'stage', label: 'Move to staging', kind: 'step', critical: false },
  ],
  edges: [{ from: 'inspect', to: 'record', label: 'yes' }, { from: 'inspect', to: 'stage', label: 'no' }],
}

test('caption uses the procedure source title and version, only when both exist', () => {
  expect(procedureCaption({ title: 'Receiving SOP', version: 3 })).toBe('Receiving SOP · v3')
  expect(procedureCaption(null)).toBeNull()
  expect(procedureCaption(undefined)).toBeNull()
  expect(procedureCaption({ title: 'Receiving SOP' })).toBeNull()
  expect(procedureCaption({ version: 3 })).toBeNull()
  expect(procedureCaption({ title: '', version: 3 })).toBeNull()
})

test('only a ready, nonempty procedure is visible', () => {
  const ready = { status: 'ready' as const, graph, source: { title: 'Receiving SOP', version: 3 } }
  expect(visibleProcedure(ready)).toBe(ready)
  expect(visibleProcedure(null)).toBeNull()
  expect(visibleProcedure({ status: 'pending' })).toBeNull()
  expect(visibleProcedure({ ...ready, graph: { nodes: [], edges: [] } })).toBeNull()
})

test('view model preserves shared branch placement and connects the resized nodes', () => {
  const layout = layoutProcedure(graph, 320)
  const model = procedureViewModel(layout, { fontSize: 13, lineHeight: 18, padding: 8, shieldSize: 16 })
  expect(model.nodes.map((n) => n.x)).toEqual(layout.nodes.map((n) => n.x + 8))
  const [decision, critical, stage] = model.nodes
  expect(critical!.x).toBeLessThan(decision!.x)
  expect(stage!.x).toBeGreaterThan(decision!.x)
  expect(critical!.lines.join('').replaceAll(' ', '')).toBe(graph.nodes[1]!.label.replaceAll(' ', ''))
  expect(critical!.critical).toBe(true)
  expect(model.edges[0]!.points[0]).toEqual({ x: decision!.x, y: decision!.y + decision!.height / 2 })
  expect(model.edges[0]!.points.at(-1)).toEqual({ x: critical!.x, y: critical!.y - critical!.height / 2 })
  expect(describeProcedure(graph)).toContain('(critical step)')
})

test('larger fonts expand nodes and the image without dropping long labels', () => {
  const layout = layoutProcedure(graph, 280)
  const normal = procedureViewModel(layout, { fontSize: 13, lineHeight: 18, padding: 8, shieldSize: 16 })
  const large = procedureViewModel(layout, { fontSize: 26, lineHeight: 36, padding: 8, shieldSize: 16 })
  expect(large.height).toBeGreaterThan(normal.height)
  for (const node of large.nodes) {
    expect(node.lines.join('').replaceAll(' ', '')).toBe(graph.nodes.find((n) => n.id === node.id)!.label.replaceAll(' ', ''))
    expect(node.height).toBeGreaterThanOrEqual(node.lines.length * 36 + 16)
    expect(node.y + node.height / 2).toBeLessThanOrEqual(large.height)
  }
})
