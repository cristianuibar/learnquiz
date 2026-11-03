import { createElement, useEffect } from 'react'
import { Text } from 'react-native'
import { act, render, screen } from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'
import { AsyncStorage } from 'expo-sqlite/kv-store'
import * as auth from './auth'
import { getToken, signIn } from './auth'
import { deferReplay, holdTarget, takeHeldTarget, takeReplayTarget } from './held-target'
import { clearPrefix, getJSON, setJSON } from './kv'
import { endSession, SessionProvider, useSession } from './session-store'

// Real auth, api, kv and session store; only the native stores and fetch are fakes.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}))
jest.mock('expo-sqlite/kv-store', () => {
  const values = new Map<string, string>()
  return { AsyncStorage: {
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { values.set(key, value) },
    removeItemAsync: async (key: string) => values.delete(key),
    getAllKeysAsync: async () => [...values.keys()],
  } }
})

type Reply = { status: number; data?: unknown; token?: string } | 'offline'
let replies: Record<string, Reply>
const learnerA = { id: 'user-a', name: 'Ana', isAnonymous: false }
const learnerB = { id: 'user-b', name: 'Bo', isAnonymous: false }

beforeAll(() => {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const reply = replies[new URL(String(input)).pathname]
    if (!reply || reply === 'offline') throw new TypeError('Network request failed')
    return { ok: reply.status === 200, status: reply.status, text: async () => JSON.stringify(reply.data ?? null),
      headers: { get: (name: string) => (name === 'set-auth-token' ? reply.token ?? null : null) } } as unknown as Response
  }) as typeof fetch
})

// Keys the store held the first time each learner's signed-in shell rendered.
let keysAtReady: Record<string, string[]>
function Probe() {
  const session = useSession()
  const id = session.status === 'ready' ? session.user?.id : undefined
  useEffect(() => {
    if (id && !keysAtReady[id]) {
      keysAtReady[id] = []
      void AsyncStorage.getAllKeysAsync().then((keys) => { keysAtReady[id] = keys })
    }
  }, [id])
  return createElement(Text, null, `${session.status}:${session.user?.name ?? '-'}:${session.offline ? 'offline' : 'online'}`)
}
const mount = () => render(createElement(SessionProvider, { children: createElement(Probe) }))
const online = (user: typeof learnerA) => ({
  '/api/v1/session': { status: 200, data: { user, needsDisclosure: false } },
  '/api/v1/branding': { status: 200, data: { name: 'Company', logoUrl: null, accent: null } },
})

beforeEach(async () => {
  keysAtReady = {}
  await clearPrefix('')
  // Leave each test with a stored bearer for learner A, as after an earlier launch.
  replies = { '/api/auth/sign-in/email': { status: 200, data: {}, token: 'token-a' } }
  await signIn('ana@example.com', 'password')
  jest.mocked(SecureStore.deleteItemAsync).mockClear()
})

test.each([
  ['no signal', 'offline' as const],
  ['a server error', { status: 503, data: { error: 'Service unavailable' } }],
])('%s at launch keeps the stored session and the signed-in shell', async (_name, failure) => {
  replies = online(learnerA)
  const first = await mount()
  expect(screen.getByText('ready:Ana:online')).toBeOnTheScreen()
  await first.unmount()
  await setJSON('lq:draft:item-1', { answer: 'kept' })

  replies = { '/api/v1/session': failure }
  await mount()
  expect(screen.getByText('ready:Ana:offline')).toBeOnTheScreen()
  expect(getToken()).toBe('token-a')
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled()
  await expect(getJSON('lq:draft:item-1')).resolves.toEqual({ answer: 'kept' })
})

test('a 401 at launch signs out and removes the token and the learner data', async () => {
  replies = online(learnerA)
  const first = await mount()
  await first.unmount()
  await setJSON('lq:today:user-a', { private: true })

  // An unfinished join holds the layout's link replay and listens for sign-out.
  takeHeldTarget()
  holdTarget('/unit/u1')
  deferReplay()
  const events = jest.fn()
  const unsubscribe = auth.subscribeAuth(events)

  replies = { '/api/v1/session': { status: 401, data: { error: 'Session expired' } } }
  await mount()
  unsubscribe()
  expect(screen.getByText('signedOut:-:online')).toBeOnTheScreen()
  expect(events.mock.calls).toEqual([['signedOut']])
  expect(takeReplayTarget()).toBe('/unit/u1')
  expect(getToken()).toBeNull()
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('lq.token')
  await expect(AsyncStorage.getAllKeysAsync()).resolves.toEqual([])
})

test('the same learner relaunching keeps their drafts and cached Today', async () => {
  replies = online(learnerA)
  const first = await mount()
  await first.unmount()
  await setJSON('lq:draft:item-1', { answer: 'kept' })
  await setJSON('lq:today:user-a', { cached: true })
  await mount()
  expect(screen.getByText('ready:Ana:online')).toBeOnTheScreen()
  await expect(getJSON('lq:draft:item-1')).resolves.toEqual({ answer: 'kept' })
  await expect(getJSON('lq:today:user-a')).resolves.toEqual({ cached: true })
})

test("a different learner signing in never sees the previous learner's lq: data", async () => {
  replies = online(learnerA)
  await mount()
  expect(screen.getByText('ready:Ana:online')).toBeOnTheScreen()
  await setJSON('lq:draft:item-1', { answer: 'from Ana' })
  await setJSON('lq:today:user-a', { cached: 'Ana' })
  await setJSON('unrelated', { kept: true })

  // Learner B signs in on the same phone without signing A out (the join flow).
  replies = { ...online(learnerB), '/api/auth/sign-in/email': { status: 200, data: {}, token: 'token-b' } }
  await act(async () => { await signIn('bo@example.com', 'password') })
  expect(screen.getByText('ready:Bo:online')).toBeOnTheScreen()
  expect(keysAtReady['user-b']).toContain('unrelated')
  expect(keysAtReady['user-b']).not.toContain('lq:draft:item-1')
  expect(keysAtReady['user-b']).not.toContain('lq:today:user-a')
  await expect(getJSON('lq:draft:item-1')).resolves.toBeNull()
  await expect(getJSON('lq:today:user-a')).resolves.toBeNull()
  await expect(getJSON('unrelated')).resolves.toEqual({ kept: true })
})

test("a new learner's sign-in with no signal never shows the previous learner offline", async () => {
  replies = online(learnerA)
  const first = await mount()
  expect(screen.getByText('ready:Ana:online')).toBeOnTheScreen()

  replies = { '/api/v1/session': 'offline', '/api/auth/sign-in/email': { status: 200, data: {}, token: 'token-b' } }
  await act(async () => { await signIn('bo@example.com', 'password') })
  expect(screen.getByText('ready:-:offline')).toBeOnTheScreen()

  // Nor after a relaunch that is still offline.
  await first.unmount()
  await mount()
  expect(screen.getByText('ready:-:offline')).toBeOnTheScreen()
  expect(getToken()).toBe('token-b')
})

describe('endSession', () => {
  async function signedInAsAna() {
    replies = { ...online(learnerA), '/api/auth/sign-out': { status: 200, data: {} } }
    await mount()
    expect(screen.getByText('ready:Ana:online')).toBeOnTheScreen()
    await setJSON('lq:today:user-a', { cached: 'Ana' })
    const events = jest.fn()
    const unsubscribe = auth.subscribeAuth(events)
    return { events, unsubscribe }
  }

  // The order #500 gives signOut(): push unregistration runs before any local cleanup.
  test.each([
    ['rejects', () => Promise.reject(new Error('Unregister failed'))],
    ['never settles', () => new Promise<void>(() => {})],
  ])('signs out when push unregistration %s before the local cleanup', async (_name, unregisterFirst) => {
    const { events, unsubscribe } = await signedInAsAna()
    const spy = jest.spyOn(auth, 'signOut').mockImplementation(unregisterFirst)
    try {
      await act(async () => { await expect(endSession(20)).resolves.toBeUndefined() })
      expect(spy).toHaveBeenCalledTimes(1)
    } finally { spy.mockRestore(); unsubscribe() }
    expect(screen.getByText('signedOut:-:online')).toBeOnTheScreen()
    expect(getToken()).toBeNull()
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('lq.token')
    expect(events.mock.calls).toEqual([['signedOut']])
    await expect(getJSON('lq:today:user-a')).resolves.toBeNull()
  })

  test('a sign-out whose cleanup fails after clearing the session is not repeated', async () => {
    const { events, unsubscribe } = await signedInAsAna()
    jest.mocked(SecureStore.deleteItemAsync).mockRejectedValueOnce(new Error('Keystore unavailable'))
    await act(async () => { await expect(endSession(20)).resolves.toBeUndefined() })
    unsubscribe()
    expect(screen.getByText('signedOut:-:online')).toBeOnTheScreen()
    expect(events.mock.calls).toEqual([['signedOut']])
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(1)
  })

  test('a learner who signs in while sign-out stalls stays signed in', async () => {
    const { events, unsubscribe } = await signedInAsAna()
    const spy = jest.spyOn(auth, 'signOut').mockImplementation(() => new Promise<void>(() => {}))
    try {
      const ending = endSession(20)
      replies = { ...online(learnerB), '/api/auth/sign-in/email': { status: 200, data: {}, token: 'token-b' } }
      await act(async () => {
        await signIn('bo@example.com', 'password')
        await ending
      })
    } finally { spy.mockRestore(); unsubscribe() }
    expect(screen.getByText('ready:Bo:online')).toBeOnTheScreen()
    expect(getToken()).toBe('token-b')
    expect(events).not.toHaveBeenCalledWith('signedOut')
  })
})
