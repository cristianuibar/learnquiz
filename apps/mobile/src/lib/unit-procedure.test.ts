import { createElement } from 'react'
import { act, render } from '@testing-library/react-native'
import { api } from './api'
import { useUnitProcedure } from './unit-procedure'

let mockToken = 'a'
jest.mock('./auth', () => ({ getToken: () => mockToken, handleUnauthorized: jest.fn() }))
jest.mock('./api', () => ({ api: jest.fn() }))
jest.mock('./session-store', () => ({ useSession: () => ({ status: 'ready' }) }))
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual('react')
    useEffect(effect, [effect])
  },
}))

const ready = { status: 'ready', graph: { nodes: [{ id: 'a', label: 'Learner A step', kind: 'step', critical: false }], edges: [] } }
let renders: ReturnType<typeof useUnitProcedure>[] = []
function Probe() { renders.push(useUnitProcedure('u1')); return null }

beforeEach(() => { mockToken = 'a'; renders = []; jest.mocked(api).mockReset() })

// Unit's path ownership can hide the whole card and mask a broken procedure
// guard. Observe this hook's render results before effects as well as after.
test('B waiting never sees A, including the render before clear-on-switch runs', async () => {
  jest.mocked(api).mockResolvedValueOnce(ready)
  const view = await render(createElement(Probe))
  await act(async () => {})
  expect(renders.at(-1)).toEqual(ready)
  jest.mocked(api).mockReturnValueOnce(new Promise(() => {}))
  mockToken = 'b'
  renders = []
  await view.rerender(createElement(Probe))
  expect(renders.length).toBeGreaterThan(0)
  expect(renders.every((result) => result === null)).toBe(true)
})

test('switching back to A while B waits cannot resurrect A content cleared by the switch', async () => {
  jest.mocked(api).mockResolvedValueOnce(ready)
  const view = await render(createElement(Probe))
  await act(async () => {})
  expect(renders.at(-1)).toEqual(ready)
  jest.mocked(api).mockReturnValue(new Promise(() => {}))
  mockToken = 'b'
  await view.rerender(createElement(Probe))
  renders = []
  mockToken = 'a'
  await view.rerender(createElement(Probe))
  expect(renders.length).toBeGreaterThan(0)
  expect(renders.every((result) => result === null)).toBe(true)
})
