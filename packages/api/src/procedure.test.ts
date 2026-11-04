import { describe, expect, it } from 'vitest'
import { describeProcedure, layoutProcedure, type ProcedureGraph } from './procedure.ts'

const node = (id: string, kind: 'step' | 'decision' = 'step', critical = false) => ({ id, kind, label: `Label ${id}`, critical })

const branching: ProcedureGraph = {
  nodes: [node('a'), node('d', 'decision'), node('y'), node('n', 'step', true)],
  edges: [
    { from: 'a', to: 'd', label: null },
    { from: 'd', to: 'n', label: 'no' },
    { from: 'd', to: 'y', label: 'yes' },
  ],
}

describe('layoutProcedure', () => {
  it('puts yes left and no right of a decision, below it, inside the width', () => {
    for (const width of [600, 240]) {
      const { nodes } = layoutProcedure(branching, width)
      const at = (id: string) => nodes.find((n) => n.id === id)!
      expect(at('y').x).toBeLessThan(at('d').x)
      expect(at('n').x).toBeGreaterThan(at('d').x)
      expect(at('y').y).toBeGreaterThan(at('d').y)
      expect(at('a').x).toBe(at('d').x)
      for (const n of nodes) {
        expect(n.x - n.width / 2).toBeGreaterThanOrEqual(0)
        expect(n.x + n.width / 2).toBeLessThanOrEqual(width)
      }
    }
  })

  it('keeps a decision\'s branches on its sides after its layer spreads', () => {
    const graph: ProcedureGraph = {
      nodes: [node('a'), node('b'), node('d', 'decision'), node('y'), node('n')],
      edges: [
        { from: 'a', to: 'b', label: null },
        { from: 'a', to: 'd', label: null },
        { from: 'd', to: 'y', label: 'yes' },
        { from: 'd', to: 'n', label: 'no' },
      ],
    }
    const { nodes } = layoutProcedure(graph, 600)
    const at = (id: string) => nodes.find((n) => n.id === id)!
    expect(at('y').x).toBeLessThan(at('d').x)
    expect(at('n').x).toBeGreaterThan(at('d').x)
  })

  it('keeps a yes branch reached earlier on the left of its decision', () => {
    const graph: ProcedureGraph = {
      nodes: [node('start'), node('ready', 'decision'), node('pack'), node('wait')],
      edges: [
        { from: 'start', to: 'ready', label: null },
        { from: 'start', to: 'pack', label: null },
        { from: 'ready', to: 'pack', label: 'yes' },
        { from: 'ready', to: 'wait', label: 'no' },
      ],
    }
    const { nodes } = layoutProcedure(graph, 600)
    const at = (id: string) => nodes.find((n) => n.id === id)!
    expect(at('pack').x).toBeLessThan(at('ready').x)
    expect(at('wait').x).toBeGreaterThan(at('ready').x)
  })

  it('keeps layers when an edge loops back', () => {
    const graph: ProcedureGraph = {
      nodes: [node('a'), node('b'), node('c', 'decision')],
      edges: [
        { from: 'a', to: 'b', label: null },
        { from: 'b', to: 'c', label: null },
        { from: 'c', to: 'a', label: 'no' },
      ],
    }
    const layout = layoutProcedure(graph, 400)
    expect(layout.nodes.map((n) => n.layer)).toEqual([0, 1, 2])
    expect(layout.edges.find((e) => e.from === 'c')!.back).toBe(true)
  })
})

describe('describeProcedure', () => {
  it('names the critical step and both branches', () => {
    const text = describeProcedure(branching)
    expect(text).toContain('Label n (critical step)')
    expect(text).toContain('If yes, go to step 3, Label y')
    expect(text).toContain('If no, go to step 4, Label n')
  })
})
