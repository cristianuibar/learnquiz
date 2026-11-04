import { createElement, Fragment } from 'react'
import { Stack, router } from 'expo-router'
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library'
import { describeProcedure, type ProcedureGraph } from '@learnquiz/api/procedure'
import { ThemeProvider } from './theme/ThemeProvider'
import { isHiddenFromAccessibility } from '@testing-library/react-native'
import { useUnitProcedure } from './lib/unit-procedure'
import UnitScreen from './app/unit/[unitId]'

let observeOwnership = false
let procedureRenders: ReturnType<typeof useUnitProcedure>[] = []
function OwnershipProbe() { procedureRenders.push(useUnitProcedure('u1')); return null }

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
  observeOwnership = false
  procedureRenders = []
  procedureReply = async () => response(ready)
  globalThis.fetch = fetchMock as typeof fetch
  fetchMock.mockClear()
})
const flush = () => act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve() })
async function openUnit() {
  await renderRouter({
    _layout: () => createElement(ThemeProvider, { children: createElement(Stack, { screenOptions: { headerShown: false, animation: 'none' } }) }),
    'unit/[unitId]': () => createElement(Fragment, null, createElement(UnitScreen), observeOwnership ? createElement(OwnershipProbe) : null),
    elsewhere: () => null,
  }, { initialUrl: '/unit/u1?topicId=t1' })
  await flush()
  const diagram = screen.queryByTestId('procedure-width')
  if (diagram) await fireEvent(diagram, 'layout', { nativeEvent: { layout: { width: 326, height: 0, x: 0, y: 0 } } })
}

// A narrow route map avoids loading all application routes in the cold first test.
test('Unit shows the procedure as one accessible image with its source caption', async () => {
  await openUnit()
  expect(screen.getByRole('header', { name: 'Receiving' })).toBeOnTheScreen()
  expect(screen.getByRole('header', { name: 'Procedure' })).toBeOnTheScreen()
  expect(screen.getAllByRole('image')).toHaveLength(1)
  const image = screen.getByRole('image', { name: describeProcedure(graph) })
  const descendants = image.queryAll(() => true)
  expect(descendants.length).toBeGreaterThan(0)
  expect(descendants.every((node) => isHiddenFromAccessibility(node))).toBe(true)
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

test.each([undefined, { title: 'Zero version', version: 0 }])('ready graphs handle optional source metadata: %j', async (source) => {
  procedureReply = async () => response({ status: 'ready', graph, source })
  await openUnit()
  expect(screen.getByRole('image', { name: describeProcedure(graph) })).toBeOnTheScreen()
  expect(screen.queryByText('Procedure source · v4')).toBeNull()
  if (source) expect(screen.getByText('Zero version · v0')).toBeOnTheScreen()
  else expect(screen.queryByText(/ · v/)).toBeNull()
})

test('no SVG is allocated until the inner card has a positive measured width', async () => {
  await openUnit()
  const diagram = screen.getByTestId('procedure-width')
  await fireEvent(diagram, 'layout', { nativeEvent: { layout: { width: 0, height: 0, x: 0, y: 0 } } })
  expect(screen.queryByTestId('procedure-svg', { includeHiddenElements: true })).toBeNull()
  await fireEvent(diagram, 'layout', { nativeEvent: { layout: { width: 326, height: 0, x: 0, y: 0 } } })
  expect(screen.getByTestId('procedure-svg', { includeHiddenElements: true }).props.vbWidth).toBe(326)
})

test('an oversized graph renders scalable native text and never mounts an SVG', async () => {
  const tall: ProcedureGraph = {
    nodes: Array.from({ length: 12 }, (_, i) => ({ id: String(i), label: 'Photograph the delivery receipt and confirm the damage before moving the pallet', kind: 'step', critical: true })),
    edges: Array.from({ length: 11 }, (_, i) => ({ from: String(i), to: String(i + 1), label: null })),
  }
  procedureReply = async () => response({ ...ready, graph: tall })
  await openUnit()
  expect(screen.queryByTestId('procedure-svg', { includeHiddenElements: true })).toBeNull()
  for (const step of describeProcedure(tall).split('\n')) expect(screen.getByText(step)).toBeOnTheScreen()
  expect(screen.getByRole('button', { name: 'Practice Receiving · 5 min' })).toBeOnTheScreen()
})

test('the previous learner stays hidden in every render while B waits, including a switch back', async () => {
  // Keep a live hook observer in the route because Unit's independent path
  // guard otherwise masks a broken procedure owner guard before effects run.
  observeOwnership = true
  await openUnit()
  const waitingB: ((value: Response) => void)[] = []
  procedureReply = (token) => token === 'Bearer learner-b'
    ? new Promise<Response>((resolve) => { waitingB.push(resolve) })
    : new Promise<Response>(() => {})
  async function switchLearner(token: string) {
    procedureRenders = []
    await act(async () => { mockToken = token; mockListeners.forEach((listener) => listener()) })
    await flush()
    expect(procedureRenders.length).toBeGreaterThan(0)
    expect(procedureRenders.every((result) => result === null)).toBe(true)
    expect(screen.queryByRole('image')).toBeNull()
    expect(screen.queryByText('Procedure source · v4')).toBeNull()
  }
  await switchLearner('learner-b')
  await switchLearner('learner-a')
  await switchLearner('learner-b')
  await act(async () => { waitingB.forEach((resolve) => resolve(response({ ...ready, source: { title: 'Learner B source', version: 2 } }))) })
  await flush()
  const diagram = screen.getByTestId('procedure-width')
  await fireEvent(diagram, 'layout', { nativeEvent: { layout: { width: 326, height: 0, x: 0, y: 0 } } })
  expect(screen.getByText('Learner B source · v2')).toBeOnTheScreen()
})
