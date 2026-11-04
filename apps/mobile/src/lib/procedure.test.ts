import { describeProcedure, layoutProcedure, type ProcedureGraph } from '@learnquiz/api/procedure'
import { procedureCaption, procedurePresentation, procedureViewModel, visibleProcedure } from './procedure'

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
  expect(model.nodes.map((n) => n.x)).toEqual(layout.nodes.map((n) => n.x))
  const [decision, critical, stage] = model.nodes
  expect(critical!.x).toBeLessThan(decision!.x)
  expect(stage!.x).toBeGreaterThan(decision!.x)
  expect(critical!.lines.join('\n').replaceAll('-\n', '').replaceAll('\n', ' ')).toBe(graph.nodes[1]!.label)
  expect(critical!.critical).toBe(true)
  expect(model.edges[0]!.points[0]).toEqual({ x: decision!.x - decision!.width / 2, y: decision!.y })
  expect(model.edges[0]!.points.at(-1)).toEqual({ x: critical!.x, y: critical!.y - critical!.height / 2 })
  expect(describeProcedure(graph)).toContain('(critical step)')
})

// Labels copied from Unit.dc.html, including the critical receipt step.
const receiving: ProcedureGraph = {
  nodes: [
    { id: 'dock', label: 'Dock door', kind: 'step', critical: false },
    { id: 'inspect', label: 'Inspect', kind: 'step', critical: false },
    { id: 'damage', label: 'Damage?', kind: 'decision', critical: false },
    { id: 'photo', label: 'Photo + note on receipt', kind: 'step', critical: true },
    { id: 'staging', label: 'Staging', kind: 'step', critical: false },
    { id: 'quarantine', label: 'Quarantine bay Q1', kind: 'step', critical: false },
    { id: 'away', label: 'Put-away', kind: 'step', critical: false },
  ],
  edges: [
    { from: 'dock', to: 'inspect', label: null }, { from: 'inspect', to: 'damage', label: null },
    { from: 'damage', to: 'photo', label: 'yes' }, { from: 'damage', to: 'staging', label: 'no' },
    { from: 'photo', to: 'quarantine', label: null }, { from: 'staging', to: 'away', label: null },
  ],
}
const metrics = { fontSize: 13, lineHeight: 18, padding: 8, shieldSize: 16 }

test('Receiving fits the 326 by 360 design within 15% and preserves whole words', () => {
  const model = procedureViewModel(layoutProcedure(receiving, 326), metrics)
  expect(model.width).toBe(326)
  expect(model.height).toBeGreaterThanOrEqual(360 * 0.85)
  expect(model.height).toBeLessThanOrEqual(360 * 1.15)
  for (const node of model.nodes) {
    expect(node.lines.join(' ')).toBe(node.label)
    expect(node.lines.every((line) => line.length >= 3)).toBe(true)
  }
  expect(model.nodes.find((n) => n.id === 'damage')!.lines).toEqual(['Damage?'])
})

test('decision branches leave the side vertices with labels beside the diamond', () => {
  const model = procedureViewModel(layoutProcedure(receiving, 326), metrics)
  const diamond = model.nodes.find((n) => n.id === 'damage')!
  for (const [label, sign] of [['yes', -1], ['no', 1]] as const) {
    const edge = model.edges.find((e) => e.label === label)!
    expect(edge.points[0]).toEqual({ x: diamond.x + sign * diamond.width / 2, y: diamond.y })
    expect(sign * (edge.labelX - diamond.x)).toBeGreaterThan(diamond.width / 2)
    expect(edge.labelY).toBe(diamond.y)
  }
})

test('a last-layer back edge has padding below its path', () => {
  const loop = { ...receiving, edges: [...receiving.edges, { from: 'away', to: 'dock', label: null }] }
  const model = procedureViewModel(layoutProcedure(loop, 326), metrics)
  const back = model.edges.find((e) => e.back)!
  expect(Math.max(...back.points.map((p) => p.y))).toBeLessThan(model.height - 2)
})

test('a critical decision keeps usable whole-word lines', () => {
  const critical = { ...receiving, nodes: receiving.nodes.map((n) => n.id === 'damage' ? { ...n, critical: true } : n) }
  const model = procedureViewModel(layoutProcedure(critical, 326), metrics)
  expect(model.nodes.find((n) => n.id === 'damage')!.lines).toEqual(['Damage?'])
})

test('2x font scaling stays within the viewport bitmap budget or uses native text', () => {
  const presentation = procedurePresentation(receiving, 326, 2, 740, metrics)
  if (presentation.kind === 'svg') {
    expect(presentation.model.height).toBeLessThanOrEqual(740 * 1.5)
    expect(presentation.model.nodes.every((node) => node.fits)).toBe(true)
  } else {
    expect(presentation.steps.join('\n')).toBe(describeProcedure(receiving))
  }
})

test('oversize SVG retries with capped font scaling before drawing', () => {
  const linear: ProcedureGraph = {
    nodes: Array.from({ length: 8 }, (_, i) => ({ id: String(i), label: 'Record the receipt', kind: 'step', critical: false })),
    edges: Array.from({ length: 7 }, (_, i) => ({ from: String(i), to: String(i + 1), label: null })),
  }
  const presentation = procedurePresentation(linear, 326, 2, 500, metrics)
  expect(presentation.kind).toBe('svg')
  if (presentation.kind === 'svg') {
    expect(presentation.fontScale).toBe(1.5)
    expect(presentation.model.height).toBeLessThanOrEqual(750)
  }
})

test('a tall graph uses complete ordered native descriptions instead of any SVG', () => {
  const tall: ProcedureGraph = {
    nodes: Array.from({ length: 12 }, (_, i) => ({ id: String(i), label: 'Photograph the delivery receipt and confirm the damage before moving the pallet', kind: 'step', critical: true })),
    edges: Array.from({ length: 11 }, (_, i) => ({ from: String(i), to: String(i + 1), label: null })),
  }
  const presentation = procedurePresentation(tall, 326, 2, 740, metrics)
  expect(presentation).toEqual({ kind: 'text', steps: describeProcedure(tall).split('\n') })
})

test('only a single word longer than the entire line is hyphenated', () => {
  const long: ProcedureGraph = { nodes: [{ id: 'a', label: 'Check supercalifragilisticexpialidocious first', kind: 'step', critical: false }], edges: [] }
  const model = procedureViewModel(layoutProcedure(long, 326), metrics)
  const lines = model.nodes[0]!.lines
  expect(lines.some((line) => line.endsWith('-'))).toBe(true)
  expect(lines.join('\n').replaceAll('-\n', '').replaceAll('\n', ' ')).toBe(long.nodes[0]!.label)
  expect(lines.filter((line) => !line.includes('Check') && !line.includes('first')).every((line) => line.length >= 3)).toBe(true)
})
