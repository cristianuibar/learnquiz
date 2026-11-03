// @vitest-environment happy-dom
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { todayFixtureNow, todayFixtures, todayView } from '@learnquiz/api/today'
import { afterEach, expect, it } from 'vitest'
import { OrgMark } from './org-mark'
import { QuestCard } from './quest-card'
import { StreakPill } from './streak-pill'

let root: Root | undefined
let container: HTMLElement | undefined

async function render(el: ReactElement) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(el))
  return container
}

afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  root = container = undefined
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false })
})

const view = (name: keyof typeof todayFixtures) => todayView(todayFixtures[name], todayFixtureNow)
const rows = (c: HTMLElement) =>
  [...c.querySelectorAll('li')].map((li) => ({
    text: li.textContent,
    status: li.querySelector('[role=img]')?.getAttribute('aria-label'),
  }))

it('lists the daily quests with their status and count', async () => {
  let c = await render(<QuestCard quests={view('normal').quests} />)
  expect(rows(c)).toEqual([
    { text: 'Clear your reviews2 of 6', status: 'Not done' },
    { text: 'One session', status: 'Not done' },
  ])
  await act(async () => root!.unmount())
  c.remove()

  c = await render(<QuestCard quests={view('done').quests} />)
  expect(rows(c).map((r) => r.status)).toEqual(['Done', 'Done'])
  await act(async () => root!.unmount())
  c.remove()

  c = await render(<QuestCard quests={view('first').quests} />)
  expect(rows(c).map((r) => r.text)).toEqual(['One session'])
})

it('reads the streak as "in a row" and hides the icon', async () => {
  const streak = view('normal').streak!
  const c = await render(<StreakPill streak={streak} variant="reward" />)
  expect(c.textContent).toBe('4 days in a row')
  expect(c.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true')
  expect(c.firstElementChild!.className).toContain('motion-safe:animate-pop-in')
})

it('falls back to initials when the logo fails or is missing', async () => {
  const c = await render(<OrgMark name="Northwind Logistics" logoUrl="https://example.test/logo.png" />)
  const img = c.querySelector('img')!
  expect(img.getAttribute('src')).toBe('https://example.test/logo.png')
  await act(async () => { img.dispatchEvent(new Event('error')) })
  expect(c.querySelector('img')).toBeNull()
  expect(c.textContent).toBe('NL')

  await act(async () => root!.render(<OrgMark name="Northwind Logistics" />))
  expect(c.textContent).toBe('NL')
})
