// @vitest-environment happy-dom
import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { BarChart } from './bar-chart'
import { HBarList } from './hbar-list'
import { LineChart } from './line-chart'
import { jobLabel, META_MODELS, modelDisplayName, type ModelJob } from '@/lib/llm/models'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

async function render(node: ReactNode) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(node) })
  return container
}

const cells = (row: Element) => [...row.querySelectorAll('th, td')].map((td) => td.textContent)

describe('BarChart', () => {
  it('names the svg with the summary and totals the same numbers in its table, marking today as partial', async () => {
    const summary = 'Model calls by day, Oct 30 to Nov 3: 3,104 in total. Peak 898 on Oct 30. Nov 3 so far: 342.'
    const el = await render(
      <BarChart
        title="Model calls by day"
        summary={summary}
        unit="Calls"
        legend="Calls"
        points={[
          { label: '30', group: 'Oct', value: 898 },
          { label: '31', group: 'Oct', value: 436 },
          { label: '1', group: 'Nov', value: 668 },
          { label: '2', group: 'Nov', value: 760 },
          { label: '3', group: 'Nov', value: 342, partial: true },
        ]}
      />,
    )
    const svg = el.querySelector('svg[role="img"]')!
    expect(svg.getAttribute('aria-label')).toBe(summary)
    const rows = [...el.querySelectorAll('table tbody tr')].map(cells)
    expect(rows).toEqual([['Oct 30', '898'], ['Oct 31', '436'], ['Nov 1', '668'], ['Nov 2', '760'], ['Nov 3 (today, so far)', '342']])
    expect(cells(el.querySelector('table tfoot tr')!)).toEqual(['Total', '3,104'])
    expect(el.querySelector('table caption')!.textContent).toBe('Model calls by day')
    expect(el.textContent).toContain('Today, so far')
  })
})

describe('BarChart with a strip and many days', () => {
  it('draws every day as a bar, thins the x labels and uses the supplied table', async () => {
    const points = Array.from({ length: 40 }, (_, i) => ({ label: String(i + 1), value: i % 7 === 0 ? 0 : 100 + i }))
    const el = await render(
      <BarChart
        title="Calls by day"
        summary="Calls"
        unit="Calls"
        legend="Calls"
        points={points}
        strip={{ legend: 'Failure rate', values: points.map((_, i) => i / 10), format: (n) => `${n}%` }}
        table={{ caption: 'Calls and failures', columns: ['Day', 'Calls'], rows: [{ key: 'a', cells: ['1', '0'] }], total: ['30 days', '5'] }}
      />,
    )
    const svg = el.querySelector('svg[role="img"]')!
    expect(svg.querySelectorAll('rect')).toHaveLength(80)
    const labels = [...svg.querySelectorAll('text')].map((t) => t.textContent)
    expect(labels.filter((l) => /^\d+$/.test(l ?? '')).length).toBeLessThan(40)
    expect(el.querySelector('table caption')!.textContent).toBe('Calls and failures')
    expect(el.querySelector('table tfoot th[scope="row"]')!.textContent).toBe('30 days')
  })
})

describe('BarChart over a 365-day range ending today', () => {
  it("keeps today's nonzero partial bars visible when the slot is narrower than the outline", async () => {
    const points = Array.from({ length: 365 }, (_, i) => ({ label: String(i + 1), value: 100, partial: i === 364 }))
    const el = await render(
      <BarChart
        title="Calls by day"
        summary="Calls"
        unit="Calls"
        legend="Calls"
        points={points}
        strip={{ legend: 'Failure rate', values: points.map(() => 5), format: (n) => `${n}%` }}
      />,
    )
    const outlines = [...el.querySelectorAll('svg[role="img"] rect.fill-surface-card')]
    expect(outlines).toHaveLength(2)
    for (const r of outlines) {
      expect(Number(r.getAttribute('width'))).toBeGreaterThan(0)
      expect(Number(r.getAttribute('height'))).toBeGreaterThan(0)
    }
  })
})

describe('LineChart', () => {
  it('keeps a day with no data in the table and draws no dot for it', async () => {
    const el = await render(
      <LineChart
        title="Latency"
        summary="Latency"
        series={[{ name: 'p50', style: 'solid', points: [{ x: 'Nov 1', y: 10 }, { x: 'Nov 2', y: null }, { x: 'Nov 3', y: 12 }] }]}
      />,
    )
    expect(el.querySelectorAll('svg[role="img"] circle')).toHaveLength(2)
    expect([...el.querySelectorAll('table tbody tr')].map(cells)).toEqual([['Nov 1', '10'], ['Nov 2', ''], ['Nov 3', '12']])
  })

  it('lists every point in its table with no total row', async () => {
    const el = await render(
      <LineChart
        title="Latency"
        summary="Latency p50 stayed near 1.2 s while p95 rose to 4.1 s."
        xLabel="Day"
        series={[
          { name: 'p50', style: 'solid', points: [{ x: 'Nov 1', y: 1200 }, { x: 'Nov 2', y: 1250 }] },
          { name: 'p95', style: 'dashed', points: [{ x: 'Nov 1', y: 3800 }, { x: 'Nov 2', y: 4100 }] },
        ]}
      />,
    )
    expect(el.querySelector('svg[role="img"]')!.getAttribute('aria-label')).toBe('Latency p50 stayed near 1.2 s while p95 rose to 4.1 s.')
    expect([...el.querySelectorAll('table th[scope="col"]')].map((th) => th.textContent)).toEqual(['Day', 'p50', 'p95'])
    expect([...el.querySelectorAll('table tbody tr')].map(cells)).toEqual([['Nov 1', '1,200', '3,800'], ['Nov 2', '1,250', '4,100']])
    expect(el.querySelector('table tfoot')).toBeNull()
  })
})

describe('HBarList', () => {
  it('sorts rows by value, lists every row in its label and totals them in its table', async () => {
    const el = await render(
      <HBarList
        title="Model calls by job"
        summary="Model calls by job:"
        labelHeading="Job"
        unit="Calls"
        rows={[{ label: 'Curriculum', value: 236 }, { label: 'Grading', value: 4412 }, { label: 'Questions', value: 2508 }]}
      />,
    )
    expect(el.querySelector('[role="img"]')!.getAttribute('aria-label')).toBe('Model calls by job: Grading 4,412, Questions 2,508, Curriculum 236.')
    expect([...el.querySelectorAll('table tbody tr')].map(cells)).toEqual([['Grading', '4,412'], ['Questions', '2,508'], ['Curriculum', '236']])
    expect(cells(el.querySelector('table tfoot tr')!)).toEqual(['Total', '7,156'])
  })
})

describe('modelDisplayName', () => {
  it.each([...META_MODELS])('names %s as a Muse model, with or without the Fireworks prefix', (id) => {
    expect(modelDisplayName(id)).toMatch(/^Muse /)
    expect(modelDisplayName(`accounts/fireworks/models/${id}`)).toBe(modelDisplayName(id))
  })

  it('shows an unknown id as recorded', () => {
    expect(modelDisplayName('llama-4-maverick')).toBe('llama-4-maverick')
  })
})

describe('jobLabel', () => {
  // Keyed on ModelJob so a new job must be added here too.
  const jobs: Record<ModelJob, true> = {
    curriculum: true, items: true, self_check: true, plan: true, grade: true, procedure: true, image: true, voice: true, placement_line: true,
  }

  it.each([...Object.keys(jobs), 'diagram'])('labels %s', (purpose) => {
    expect(jobLabel(purpose)).not.toBe(purpose)
  })

  it('labels the stored diagram purpose like image jobs and leaves unknown purposes unchanged', () => {
    expect(jobLabel('diagram')).toBe('Diagrams')
    expect(jobLabel('image')).toBe('Diagrams')
    expect(jobLabel('something_new')).toBe('something_new')
  })
})
