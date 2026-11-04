// @vitest-environment happy-dom
import { act, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { BulkBar } from './bulk-bar'
import { DataTable, NoResults, NullCell, TableSkeleton, type Column, type SortDirection } from './data-table'
import { FilterChip, useChipGroup } from './filter-chip'
import { Pager } from './pager'
import { RowMenu } from './row-menu'
import { SearchField } from './search-field'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

async function render(node: ReactNode) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(node) })
  return container
}

type Row = { id: string; text: string; uses: number }
const ROWS: Row[] = [{ id: 'a', text: 'Alpha', uses: 3 }, { id: 'b', text: 'Beta', uses: 9 }]
const COLUMNS: Column<Row>[] = [
  { key: 'text', header: 'Question', sortable: true, stack: 'full', cell: (r) => r.text },
  { key: 'uses', header: 'Uses', align: 'end', sortable: true, cell: (r) => r.uses },
  { key: 'owner', header: 'Owner', hideBelowLg: true, cell: () => <NullCell label="Not joined" /> },
]

function Sortable() {
  const [sort, setSort] = useState<{ key: string; direction: SortDirection }>({ key: 'text', direction: 'ascending' })
  const onSort = (key: string) =>
    setSort((s) => ({ key, direction: s.key === key ? (s.direction === 'ascending' ? 'descending' : 'ascending') : 'descending' }))
  return <DataTable caption="Questions" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} sort={sort} onSort={onSort} />
}

describe('DataTable', () => {
  it('has a caption and every header cell is scope=col', async () => {
    const el = await render(<DataTable caption="Questions" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />)
    expect(el.querySelector('caption')?.textContent).toBe('Questions')
    const ths = [...el.querySelectorAll('th')]
    expect(ths).toHaveLength(3)
    expect(ths.every((th) => th.getAttribute('scope') === 'col')).toBe(true)
    expect(el.textContent).toContain('Not joined')
  })

  it('moves aria-sort to one header and names the order in the caption', async () => {
    const el = await render(<Sortable />)
    const sorted = () => [...el.querySelectorAll('th[aria-sort]')]
    const click = async (name: string) => {
      const btn = [...el.querySelectorAll('th button')].find((b) => b.textContent === name) as HTMLElement
      await act(async () => { btn.click() })
    }
    expect(sorted().map((t) => t.getAttribute('aria-sort'))).toEqual(['ascending'])
    expect(el.querySelector('caption')?.textContent).toBe('Questions, sorted by question, least first')
    await click('Question')
    expect(sorted().map((t) => t.getAttribute('aria-sort'))).toEqual(['descending'])
    expect(el.querySelector('caption')?.textContent).toContain('most first')
    await click('Uses')
    expect(sorted()).toHaveLength(1)
    expect(sorted()[0].textContent).toBe('Uses')
    expect(sorted()[0].getAttribute('aria-sort')).toBe('descending')
    expect(el.querySelector('caption')?.textContent).toContain('sorted by uses')
  })

  it('keeps table semantics in stack mode', async () => {
    const el = await render(<DataTable stack caption="Questions" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />)
    expect(el.querySelector('table')?.getAttribute('role')).toBe('table')
    expect(el.querySelectorAll('[role="rowgroup"]')).toHaveLength(2)
    expect(el.querySelectorAll('[role="row"]')).toHaveLength(3)
    expect(el.querySelectorAll('[role="columnheader"]')).toHaveLength(3)
    expect(el.querySelectorAll('[role="cell"]')).toHaveLength(6)
    expect(el.querySelector('thead')).not.toBeNull()
    expect(el.querySelector('td')?.getAttribute('data-label')).toBe('Question')
  })

  it('names row checkboxes and marks selected rows', async () => {
    const selection = { selected: new Set(['b']), onToggle: vi.fn(), onToggleAll: vi.fn(), rowLabel: (r: Row) => r.text }
    const el = await render(<DataTable caption="Questions" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} selection={selection} />)
    const box = el.querySelector('input[aria-label="Select Beta"]') as HTMLInputElement
    expect(box.checked).toBe(true)
    expect(el.querySelector('input[aria-label="Select all 2 on this page"]')).not.toBeNull()
    const selected = [...el.querySelectorAll('tbody tr')].filter((r) => r.getAttribute('aria-selected') === 'true')
    expect(selected).toHaveLength(1)
    expect(selected[0].textContent).toContain('Beta')
    await act(async () => { (el.querySelector('input[aria-label="Select Alpha"]') as HTMLElement).click() })
    expect(selection.onToggle).toHaveBeenCalledWith('a')
  })
})

describe('NoResults', () => {
  it('clears filters and focuses the search field', async () => {
    const onClear = vi.fn()
    function Harness() {
      const ref = useRef<HTMLInputElement>(null)
      return (
        <>
          <SearchField label="Search questions" ref={ref} />
          <table><tbody><NoResults colSpan={3} onClear={onClear} searchRef={ref}>No questions match.</NoResults></tbody></table>
        </>
      )
    }
    const el = await render(<Harness />)
    expect(el.querySelector('[role="status"]')?.textContent).toContain('No questions match.')
    const btn = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Clear filters') as HTMLElement
    await act(async () => { btn.click() })
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(el.querySelector('input'))
  })
})

describe('TableSkeleton', () => {
  it('is busy and announces loading once', async () => {
    const el = await render(<TableSkeleton caption="Questions" columns={COLUMNS} status="Loading questions" />)
    expect(el.querySelector('table')?.getAttribute('aria-busy')).toBe('true')
    const status = el.querySelectorAll('[role="status"]')
    expect(status).toHaveLength(1)
    expect(status[0].textContent).toBe('Loading questions')
    expect(el.querySelector('tbody')?.getAttribute('aria-hidden')).toBe('true')
  })
})

const click = (el: Element) => act(async () => { (el as HTMLElement).click() })
const key = (k: string, el: Element = document.activeElement!) =>
  act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })) })

function Chips() {
  const g = useChipGroup<'a' | 'b'>('single')
  return (
    <>
      <FilterChip pressed={g.isPressed('a')} count={38} onClick={() => g.toggle('a')}>Unreviewed</FilterChip>
      <FilterChip pressed={g.isPressed('b')} count={4} onClick={() => g.toggle('b')}>Flagged</FilterChip>
    </>
  )
}

describe('FilterChip', () => {
  it('toggles aria-pressed and reads label with count', async () => {
    const el = await render(<Chips />)
    const [a, b] = Array.from(el.querySelectorAll('button'))
    expect(a.textContent).toBe('Unreviewed 38')
    expect(a.getAttribute('aria-pressed')).toBe('false')
    await click(a)
    expect(a.getAttribute('aria-pressed')).toBe('true')
    await click(b)
    expect(a.getAttribute('aria-pressed')).toBe('false')
    expect(b.getAttribute('aria-pressed')).toBe('true')
    await click(b)
    expect(b.getAttribute('aria-pressed')).toBe('false')
  })
})

describe('RowMenu', () => {
  it('supports keyboard navigation, Escape and outside press', async () => {
    const onSelect = vi.fn()
    const el = await render(
      <RowMenu label="Jordan Reyes" items={[{ label: 'View', onSelect }, { label: 'Ban', onSelect, separatorBefore: true }, { label: 'Delete', onSelect }]} />,
    )
    const trigger = el.querySelector('button')!
    expect(trigger.getAttribute('aria-label')).toBe('More actions for Jordan Reyes')
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(el.querySelector('[role="menu"]')).not.toBeNull()
    const items = Array.from(el.querySelectorAll('[role="menuitem"]'))
    expect(document.activeElement).toBe(items[0])
    await key('ArrowDown'); expect(document.activeElement).toBe(items[1])
    await key('End'); expect(document.activeElement).toBe(items[2])
    await key('Home'); expect(document.activeElement).toBe(items[0])
    await key('ArrowUp'); expect(document.activeElement).toBe(items[2])
    await key('Escape')
    expect(el.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    await click(trigger)
    await act(async () => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })) })
    expect(el.querySelector('[role="menu"]')).toBeNull()
    await click(trigger)
    await click(el.querySelectorAll('[role="menuitem"]')[1])
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(el.querySelector('[role="menu"]')).toBeNull()
  })
})

describe('Pager', () => {
  const button = (el: Element, name: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent === name)!
  it('shows the range and disables at the ends', async () => {
    const onNext = vi.fn()
    const first = await render(<Pager from={1} to={25} total={214} noun="users" page={1} onPrevious={() => {}} onNext={onNext} />)
    expect(first.querySelector('[role="status"]')?.textContent).toBe('1–25 of 214 users')
    expect(button(first, 'Previous').disabled).toBe(true)
    await click(button(first, 'Next'))
    expect(onNext).toHaveBeenCalledTimes(1)
    const last = await render(<Pager from={201} to={214} total={214} noun="users" page={9} onPrevious={() => {}} onNext={onNext} />)
    expect(button(last, 'Next').disabled).toBe(true)
    expect(button(last, 'Previous').disabled).toBe(false)
  })
})

describe('BulkBar', () => {
  it('announces the count and clears', async () => {
    const onClear = vi.fn()
    const el = await render(<BulkBar count={3} onClear={onClear}><button type="button">Ban</button></BulkBar>)
    expect(el.querySelector('[role="status"]')?.textContent).toBe('3 selected')
    await click(Array.from(el.querySelectorAll('button')).find((b) => b.textContent === 'Clear selection')!)
    expect(onClear).toHaveBeenCalled()
  })
})
