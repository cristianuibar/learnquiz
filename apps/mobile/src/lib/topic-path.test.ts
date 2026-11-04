import { createElement } from 'react'
import { act, render } from '@testing-library/react-native'
import type { TopicPath } from '@learnquiz/api/progress'
import { api, ApiError } from './api'
import { getToken } from './auth'
import { useSession } from './session-store'
import { ownsPath, pathFailure, useTopicPath } from './topic-path'

jest.mock('./auth', () => ({ getToken: jest.fn(), handleUnauthorized: jest.fn(() => Promise.resolve()) }))
jest.mock('./session-store', () => ({ useSession: jest.fn() }))
jest.mock('./api', () => {
  const actual = jest.requireActual('./api')
  return { ApiError: actual.ApiError, api: jest.fn() }
})
// Focus runs like an effect and re-runs when its callback changes.
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual('react')
    useEffect(() => effect(), [effect])
  },
}))

const mockApi = jest.mocked(api)
const mockGetToken = jest.mocked(getToken)
const mockSession = jest.mocked(useSession)

function pathFor(title: string): TopicPath {
  return {
    topic: { id: 'topic-1', title, goal: null, status: 'ready', generatedBy: null },
    preparing: false, placeable: true, company: null, benchmark: 0.85, onboarding: null, mastery: 0.66, nextUnitId: null,
    learner: { level: 3, levelLine: null, levelLineModel: null, placed: true, xp: 0, streak: 0 },
    units: [], edges: [],
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

let latest: ReturnType<typeof useTopicPath>
function Probe({ topicId }: { topicId: string | null }) {
  latest = useTopicPath(topicId)
  return null
}

beforeEach(() => {
  mockApi.mockReset()
  mockGetToken.mockReturnValue('token-a')
  mockSession.mockReturnValue({ status: 'ready' } as ReturnType<typeof useSession>)
})

test('loads the topic path and shows it once it arrives', async () => {
  const first = deferred<TopicPath>()
  mockApi.mockReturnValueOnce(first.promise)
  await render(createElement(Probe, { topicId: 'topic-1' }))
  expect(latest).toMatchObject({ path: null, status: 'loading' })
  expect(mockApi).toHaveBeenCalledWith('/topics/topic-1/path', { signal: expect.any(AbortSignal) })
  await act(async () => { first.resolve(pathFor('Warehouse picker')) })
  expect(latest.status).toBe('ready')
  expect(latest.path?.topic.title).toBe('Warehouse picker')
})

test('a refetch keeps the loaded path on screen until the new one lands', async () => {
  mockApi.mockResolvedValueOnce(pathFor('Before'))
  await render(createElement(Probe, { topicId: 'topic-1' }))
  await act(async () => {})
  const second = deferred<TopicPath>()
  mockApi.mockReturnValueOnce(second.promise)
  await act(async () => { latest.retry() })
  expect(mockApi).toHaveBeenCalledTimes(2)
  expect(latest).toMatchObject({ status: 'ready', path: expect.objectContaining({ topic: expect.objectContaining({ title: 'Before' }) }) })
  await act(async () => { second.resolve(pathFor('After')) })
  expect(latest.path?.topic.title).toBe('After')
})

test('a path fetched under one token is never shown under another', async () => {
  const underA = deferred<TopicPath>()
  mockApi.mockReturnValueOnce(underA.promise)
  const view = await render(createElement(Probe, { topicId: 'topic-1' }))
  const underB = deferred<TopicPath>()
  mockApi.mockReturnValueOnce(underB.promise)
  mockGetToken.mockReturnValue('token-b')
  await view.rerender(createElement(Probe, { topicId: 'topic-1' }))
  await act(async () => { underA.resolve(pathFor('Token A path')) })
  expect(latest).toMatchObject({ path: null, status: 'loading' })
  await act(async () => { underB.resolve(pathFor('Token B path')) })
  expect(latest.path?.topic.title).toBe('Token B path')
})

test('hides a loaded path at once when the token changes, before any refetch', async () => {
  mockApi.mockResolvedValueOnce(pathFor('Token A path'))
  const view = await render(createElement(Probe, { topicId: 'topic-1' }))
  await act(async () => {})
  expect(latest.path?.topic.title).toBe('Token A path')
  mockApi.mockReturnValueOnce(new Promise(() => {}))
  mockGetToken.mockReturnValue('token-b')
  await view.rerender(createElement(Probe, { topicId: 'topic-1' }))
  expect(latest).toMatchObject({ path: null, status: 'loading' })
})

test('a failed refetch keeps the path and reports offline; a 401 changes nothing', async () => {
  mockApi.mockResolvedValueOnce(pathFor('Loaded'))
  await render(createElement(Probe, { topicId: 'topic-1' }))
  await act(async () => {})
  mockApi.mockRejectedValueOnce(new ApiError(null, 'Network request failed'))
  await act(async () => { latest.retry() })
  expect(latest).toMatchObject({ status: 'offline', path: expect.objectContaining({ topic: expect.objectContaining({ title: 'Loaded' }) }) })
  mockApi.mockRejectedValueOnce(new ApiError(401, 'Unauthorized'))
  await act(async () => { latest.retry() })
  expect(latest.status).toBe('offline')
})

test('waits for a topic and a ready session before fetching', async () => {
  const view = await render(createElement(Probe, { topicId: null }))
  expect(mockApi).not.toHaveBeenCalled()
  mockSession.mockReturnValue({ status: 'loading' } as ReturnType<typeof useSession>)
  await view.rerender(createElement(Probe, { topicId: 'topic-1' }))
  expect(mockApi).not.toHaveBeenCalled()
  expect(latest).toMatchObject({ path: null, status: 'loading' })
})

describe('pure parts', () => {
  test('a request with no response is offline, a server failure is an error', () => {
    expect(pathFailure(new ApiError(null, 'Network request failed'))).toBe('offline')
    expect(pathFailure(new ApiError(500, 'Internal'))).toBe('error')
    expect(pathFailure(new Error('boom'))).toBe('error')
  })

  test('a path belongs to the token and topic it was fetched for', () => {
    expect(ownsPath({ token: 'a', topicId: 't' }, 'a', 't')).toBe(true)
    expect(ownsPath({ token: 'a', topicId: 't' }, 'b', 't')).toBe(false)
    expect(ownsPath({ token: 'a', topicId: 't' }, 'a', 'u')).toBe(false)
    expect(ownsPath({ token: null, topicId: null }, null, null)).toBe(false)
  })
})
