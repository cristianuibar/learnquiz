import { describeProcedure, layoutProcedure, type ProcedureGraph } from '@learnquiz/api/procedure'
import { CHAR_EM, edgesCrossNodes, MAX_PROCEDURE_SVG_HEIGHT, procedureCaption, procedurePresentation, procedureViewModel, visibleProcedure } from './procedure'

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

test('a loop uses ordered native text with an explicit return instruction', () => {
  const loop = { ...receiving, edges: [...receiving.edges, { from: 'away', to: 'dock', label: null }] }
  const presentation = procedurePresentation(loop, 326, 1, 740, metrics)!
  expect(presentation.kind).toBe('text')
  if (presentation.kind === 'text') {
    expect(presentation.steps).toHaveLength(receiving.nodes.length)
    expect(presentation.steps.at(-1)).toContain('Then go back to: Dock door.')
    expect(presentation.steps[0]).toContain('1. Dock door.')
  }
})

test('a decision loop names its condition and target in the existing step order', () => {
  const loop: ProcedureGraph = {
    nodes: [
      { id: 'scan', kind: 'step', label: 'Scan', critical: false },
      { id: 'seal', kind: 'decision', label: 'Seal intact?', critical: false },
      { id: 'pack', kind: 'step', label: 'Pack', critical: false },
    ],
    edges: [{ from: 'scan', to: 'seal', label: null }, { from: 'seal', to: 'pack', label: 'yes' }, { from: 'seal', to: 'scan', label: 'no' }],
  }
  const presentation = procedurePresentation(loop, 326, 1, 740, metrics)!
  expect(presentation.kind).toBe('text')
  if (presentation.kind === 'text') {
    expect(presentation.steps[1]).toContain('If no, go back to: Scan.')
    expect(presentation.steps[2]).toBe('3. Pack.')
  }
})

test('a critical Receiving diamond remains a readable SVG', () => {
  const critical = { ...receiving, nodes: receiving.nodes.map((n) => n.id === 'damage' ? { ...n, critical: true } : n) }
  const presentation = procedurePresentation(critical, 326, 1, 740, metrics)!
  expect(presentation.kind).toBe('svg')
  if (presentation.kind === 'svg') {
    const diamond = presentation.model.nodes.find((n) => n.id === 'damage')!
    expect(diamond.fits).toBe(true)
    expect(diamond.lines).toEqual(['Damage?'])
    // Twelve caption characters must fit alongside the shield, not just the
    // seven in Damage?: both former half-width formulas lose that space.
    expect(diamond.textWidth).toBeGreaterThanOrEqual(12 * 13 * 0.55)
  }
})

test('a plain Seal intact? diamond stays on one line', () => {
  const seal = { ...receiving, nodes: receiving.nodes.map((n) => n.id === 'damage' ? { ...n, label: 'Seal intact?' } : n) }
  const presentation = procedurePresentation(seal, 326, 1, 740, metrics)!
  expect(presentation.kind).toBe('svg')
  if (presentation.kind === 'svg') {
    const diamond = presentation.model.nodes.find((n) => n.id === 'damage')!
    expect(diamond.fits).toBe(true)
    expect(diamond.lines).toEqual(['Seal intact?'])
  }
})

test.each([[286, 1], [326, 1], [377, 1], [326, 1.3]])('Receiving stays SVG at %s dp and %sx with whole words unless a word exceeds its line', (width, scale) => {
  const presentation = procedurePresentation(receiving, width!, scale!, 740, metrics)!
  expect(presentation.kind).toBe('svg')
  if (presentation.kind === 'svg') {
    expect(presentation.fontScale).toBe(scale)
    for (const node of presentation.model.nodes) {
      expect(node.fits).toBe(true)
      if (scale === 1) expect(node.lines.join(' ')).toBe(node.label)
      else {
        expect(node.lines.join('\n').replaceAll('-\n', '').replaceAll('\n', ' ')).toBe(node.label)
        for (const word of node.label.split(' ')) {
          if (word.length * presentation.fontSize * 0.55 <= node.textWidth) {
            expect(node.lines.join(' ').split(' ')).toContain(word)
          }
        }
      }
    }
  }
})

test('Inter estimation and the absolute bitmap budget stay pinned', () => {
  expect(CHAR_EM).toBe(0.55)
  expect(MAX_PROCEDURE_SVG_HEIGHT).toBe(1200)
})

test.each([0, -1])('a nonpositive width %s produces no presentation', (width) => {
  expect(procedurePresentation(receiving, width, 1, 740, metrics)).toBeNull()
})

test('2x font scaling stays within the viewport bitmap budget or uses native text', () => {
  const presentation = procedurePresentation(receiving, 326, 2, 740, metrics)!
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
  const presentation = procedurePresentation(linear, 326, 2, 500, metrics)!
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
  const presentation = procedurePresentation(tall, 326, 2, 740, metrics)!
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

test('a tall window still applies the 1200 dp bitmap ceiling', () => {
  const linear: ProcedureGraph = {
    nodes: Array.from({ length: 12 }, (_, i) => ({ id: String(i), label: 'Record the receipt', kind: 'step', critical: false })),
    edges: Array.from({ length: 11 }, (_, i) => ({ from: String(i), to: String(i + 1), label: null })),
  }
  const presentation = procedurePresentation(linear, 326, 2, 2000, metrics)!
  expect(presentation.kind).toBe('svg')
  if (presentation.kind === 'svg') {
    expect(presentation.fontScale).toBe(1.5)
    expect(presentation.model.height).toBeLessThanOrEqual(1200)
  }
})


// Both branches of a decision rejoin at one step, with the tall critical step on
// the yes side. The no branch's edge used to turn halfway down from its own
// short node and cut through the critical step, reading as Staging -> Photo.
const rejoin: ProcedureGraph = {
  nodes: [
    { id: 'dock', label: 'Dock door', kind: 'step', critical: false },
    { id: 'damage', label: 'Damage?', kind: 'decision', critical: false },
    { id: 'photo', label: 'Photograph the damage and note it on the receipt', kind: 'step', critical: true },
    { id: 'stage', label: 'Staging', kind: 'step', critical: false },
    { id: 'away', label: 'Put-away', kind: 'step', critical: false },
  ],
  edges: [
    { from: 'dock', to: 'damage', label: null },
    { from: 'damage', to: 'photo', label: 'yes' },
    { from: 'damage', to: 'stage', label: 'no' },
    { from: 'photo', to: 'away', label: null },
    { from: 'stage', to: 'away', label: null },
  ],
}
const rejoinMetrics = { fontSize: 13, lineHeight: 18, padding: 8, shieldSize: 16 }

test.each([[286, 1], [326, 1], [326, 1.3], [377, 1], [377, 1.3]])('rejoining branches draw no edge through a node at %s dp and %sx', (width, scale) => {
  const presentation = procedurePresentation(rejoin, width, scale, 740, rejoinMetrics)
  expect(presentation?.kind).toBe('svg')
  if (presentation?.kind !== 'svg') return
  expect(edgesCrossNodes(presentation.model)).toBe(false)
  const photo = presentation.model.nodes.find((n) => n.id === 'photo')!
  const stageEdge = presentation.model.edges.find((e) => e.from === 'stage')!
  // The horizontal run sits below the tallest node of the source layer.
  expect(stageEdge.points[1]!.y).toBeGreaterThan(photo.y + photo.height / 2)
})

test('an edge through a node box is detected, and touching a border is not', () => {
  const nodes = [{ x: 50, y: 50, width: 40, height: 40 }, { x: 150, y: 50, width: 40, height: 40 }]
  expect(edgesCrossNodes({ nodes, edges: [{ points: [{ x: 150, y: 70 }, { x: 150, y: 60 }, { x: 50, y: 60 }, { x: 50, y: 120 }] }] })).toBe(true)
  expect(edgesCrossNodes({ nodes, edges: [{ points: [{ x: 150, y: 70 }, { x: 150, y: 80 }, { x: 50, y: 80 }, { x: 50, y: 120 }] }] })).toBe(false)
  expect(edgesCrossNodes({ nodes, edges: [{ points: [{ x: 50, y: 70 }, { x: 50, y: 100 }] }] })).toBe(false)
})

// A decision whose yes and no both lead to the same step: its side exits run
// through the target's box. The schema allows this shape, so the presentation
// must fall back to the ordered text list rather than draw a false connection.
const sameTarget: ProcedureGraph = {
  nodes: [
    { id: 'scan', label: 'scan pallet the bay', kind: 'step', critical: false },
    { id: 'count', label: 'cases label cases label Move scan', kind: 'step', critical: false },
    { id: 'move', label: 'Move?', kind: 'decision', critical: true },
    { id: 'notify', label: 'Notify Notify Check staging Move label', kind: 'step', critical: true },
  ],
  edges: [
    { from: 'scan', to: 'count', label: null },
    { from: 'count', to: 'move', label: null },
    { from: 'move', to: 'notify', label: 'yes' },
    { from: 'move', to: 'notify', label: 'no' },
  ],
}

test('a layout whose edges would cross a node uses the text list', () => {
  const model = procedureViewModel(layoutProcedure(sameTarget, 326), rejoinMetrics)
  expect(model.nodes.every((n) => n.fits)).toBe(true)
  expect(edgesCrossNodes(model)).toBe(true)
  expect(procedurePresentation(sameTarget, 326, 1, 740, rejoinMetrics)?.kind).toBe('text')
})
