import { createElement } from 'react'
import { Stack, router } from 'expo-router'
import { act, renderRouter, screen } from 'expo-router/testing-library'
import { describeProcedure, type ProcedureGraph } from '@learnquiz/api/procedure'
import { ThemeProvider } from './theme/ThemeProvider'
import UnitScreen from './app/unit/[unitId]'

let mockToken = 'learner-a'
const mockListeners = new Set<() => void>()
jest.mock('./lib/auth', () => ({ getToken: () => mockToken, handleUnauthorized: jest.fn() }))
jest.mock('./lib/session-store', () => ({
  useSession: () => {
    const React = jest.requireActual('react')
    React.useSyncExternalStore(
      (listener: () => void) => { mockListeners.add(listener); return () => { mockListeners.delete(listener) } },
      () => mockToken,
    )
    return { status: 'ready' }
  },
}))
jest.mock('./components/question/diagram-image', () => ({ DiagramImage: () => null }))
jest.mock('expo-router/build/toolbar/native', () => ({ RouterToolbarHost: 'View', RouterToolbarItem: 'View' }))
jest.mock(require.resolve('expo-glass-effect', { paths: [require.resolve('expo-router')] }), () => ({
  GlassView: 'View', isLiquidGlassAvailable: () => false, isGlassEffectAPIAvailable: () => false,
}))

const graph: ProcedureGraph = {
  nodes: [{ id: 'record', label: 'Record damage before moving', kind: 'step', critical: true }], edges: [],
}
const ready = { status: 'ready', graph, source: { title: 'Procedure source', version: 4 } }
const path = {
  topic: { id: 't1', title: 'Warehouse' }, benchmark: 0.85,
  units: [{ id: 'u1', name: 'Receiving', order: 0, summary: '', mastery: 0.8, measured: true,
    state: 'learning', unlocked: true, canPractice: true, criticalCount: 0, source: null, concepts: [] }],
}
const response = (data: unknown, status = 200) => ({ ok: status === 200, status, text: async () => JSON.stringify(data), headers: { get: () => null } }) as unknown as Response
let procedureReply: (token: string) => Promise<Response>
const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input))
  if (url.pathname === '/api/v1/topics/t1/path') return Promise.resolve(response(path))
  if (url.pathname === '/api/v1/units/u1/procedure') return procedureReply((init?.headers as Record<string, string>).Authorization)
  throw new Error(`Unexpected request: ${url.pathname}`)
})

beforeEach(() => {
  mockToken = 'learner-a'
  procedureReply = async () => response(ready)
  globalThis.fetch = fetchMock as typeof fetch
  fetchMock.mockClear()
})
const flush = () => act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve() })
async function openUnit() {
  await renderRouter({
    _layout: () => createElement(ThemeProvider, { children: createElement(Stack, { screenOptions: { headerShown: false, animation: 'none' } }) }),
    'unit/[unitId]': UnitScreen,
    elsewhere: () => null,
  }, { initialUrl: '/unit/u1?topicId=t1' })
  await flush()
}

// A narrow route map avoids loading all application routes in the cold first test.
test('Unit shows the procedure as one accessible image with its source caption', async () => {
  await openUnit()
  expect(screen.getByRole('header', { name: 'Receiving' })).toBeOnTheScreen()
  expect(screen.getByRole('header', { name: 'Procedure' })).toBeOnTheScreen()
  expect(screen.getAllByRole('image')).toHaveLength(1)
  expect(screen.queryByText(graph.nodes[0]!.label)).toBeNull()
  expect(screen.getByRole('image', { name: describeProcedure(graph) })).toBeOnTheScreen()
  expect(screen.getByText('Procedure source · v4')).toBeOnTheScreen()
})

test.each(['null', 'pending', 'error'])('Unit remains usable when procedure returns %s', async (result) => {
  procedureReply = async () => result === 'error' ? response({ error: 'Unavailable' }, 500) : response(result === 'null' ? null : { status: 'pending' })
  await openUnit()
  expect(screen.queryByRole('header', { name: 'Procedure' })).toBeNull()
  expect(screen.getByRole('header', { name: 'Concepts' })).toBeOnTheScreen()
  expect(screen.getByRole('button', { name: 'Practice Receiving · 5 min' })).toBeOnTheScreen()
})

test('a learner switch drops a late procedure response', async () => {
  let resolveA!: (value: Response) => void
  const lateA = new Promise<Response>((resolve) => { resolveA = resolve })
  procedureReply = (token) => token === 'Bearer learner-a' ? lateA : Promise.resolve(response({ ...ready, source: { title: 'Learner B source', version: 2 } }))
  await openUnit()
  await act(async () => { mockToken = 'learner-b'; mockListeners.forEach((listener) => listener()) })
  await flush()
  expect(screen.getByText('Learner B source · v2')).toBeOnTheScreen()
  await act(async () => { resolveA(response(ready)) })
  await flush()
  expect(screen.queryByText('Procedure source · v4')).toBeNull()
  expect(screen.getByText('Learner B source · v2')).toBeOnTheScreen()
})

test('loaded procedure stays visible while refetching and after a failed refetch', async () => {
  await openUnit()
  let resolveRefetch!: (value: Response) => void
  procedureReply = () => new Promise<Response>((resolve) => { resolveRefetch = resolve })
  await act(async () => { router.push('/elsewhere') })
  await act(async () => { router.back() })
  await flush()
  expect(screen.getByText('Procedure source · v4')).toBeOnTheScreen()
  await act(async () => { resolveRefetch(response({ error: 'Unavailable' }, 500)) })
  await flush()
  expect(screen.getByText('Procedure source · v4')).toBeOnTheScreen()
})
