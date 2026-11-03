import { createElement } from 'react'
import { AppState, Text, type AppStateStatus } from 'react-native'
import { act, render, screen } from '@testing-library/react-native'
import { api, ApiError } from './api'
import { getToken, handleUnauthorized, loadToken, subscribeAuth } from './auth'
import { SessionProvider, useSession } from './session-store'
import { deferReplay, holdTarget, takeHeldTarget, takeReplayTarget } from './held-target'

jest.mock('./api', () => ({ api: jest.fn(), ApiError: jest.requireActual('./api').ApiError }))
jest.mock('expo-sqlite/kv-store', () => {
  const values = new Map<string, string>()
  return { AsyncStorage: {
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { values.set(key, value) },
    removeItemAsync: async (key: string) => values.delete(key),
    getAllKeysAsync: async () => [...values.keys()],
  } }
})
jest.mock('./auth', () => ({ getToken: jest.fn(), loadToken: jest.fn(), handleUnauthorized: jest.fn(), subscribeAuth: jest.fn() }))

let current: ReturnType<typeof useSession>
let event: (type: 'changed' | 'signedOut') => void
const user = { id: 'u1', name: 'Learner', isAnonymous: false }
function Probe() {
  current = useSession()
  return createElement(Text, null, `${current.status}:${current.user?.name ?? '-'}:${current.needsDisclosure}:${current.branding?.accent ?? '-'}`)
}
function mount() { return render(createElement(SessionProvider, { children: createElement(Probe) })) }

let foreground: (state: AppStateStatus) => void
beforeEach(async () => {
  jest.resetAllMocks()
  await require('./kv').clearPrefix('')
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    foreground = listener
    return { remove: jest.fn() }
  })
  jest.mocked(getToken).mockReturnValue('token')
  jest.mocked(loadToken).mockResolvedValue('token')
  jest.mocked(subscribeAuth).mockImplementation((listener) => { event = listener; return jest.fn() })
})

test('stays loading through session and branding, then exposes disclosure and branding', async () => {
  let resolveBranding!: (value: unknown) => void
  jest.mocked(api).mockResolvedValueOnce({ user, needsDisclosure: true })
    .mockReturnValueOnce(new Promise((resolve) => { resolveBranding = resolve }))
  await mount()
  expect(screen.getByText('loading:-:false:-')).toBeOnTheScreen()
  expect(api).toHaveBeenNthCalledWith(1, '/session')
  expect(api).toHaveBeenNthCalledWith(2, '/branding')
  await act(async () => { resolveBranding({ name: 'Company', logoUrl: null, accent: '#604080' }) })
  expect(screen.getByText('ready:Learner:true:#604080')).toBeOnTheScreen()
  await act(async () => { current.setDisclosed() })
  expect(screen.getByText('ready:Learner:false:#604080')).toBeOnTheScreen()
})

test('a missing token resolves signed out without making protected calls', async () => {
  jest.mocked(loadToken).mockResolvedValue(null)
  await mount()
  expect(screen.getByText('signedOut:-:false:-')).toBeOnTheScreen()
  expect(api).not.toHaveBeenCalled()
})

test('a null session user clears the secure token and never loads branding', async () => {
  jest.mocked(api).mockResolvedValue({ user: null, needsDisclosure: false })
  jest.mocked(handleUnauthorized).mockImplementation(async () => { event('signedOut') })
  await mount()
  expect(handleUnauthorized).toHaveBeenCalledTimes(1)
  expect(api).toHaveBeenCalledTimes(1)
  expect(screen.getByText('signedOut:-:false:-')).toBeOnTheScreen()
})

test('a signed-out event prevents an old branding response from restoring the session', async () => {
  let resolveBranding!: (value: unknown) => void
  jest.mocked(api).mockResolvedValueOnce({ user, needsDisclosure: false })
    .mockReturnValueOnce(new Promise((resolve) => { resolveBranding = resolve }))
  await mount()
  await act(async () => { event('signedOut') })
  await act(async () => { resolveBranding({ name: 'Old Company', accent: '#604080', logoUrl: null }) })
  expect(screen.getByText('signedOut:-:false:-')).toBeOnTheScreen()
})

test('offline startup without a confirmed session shows the signed-in shell and retries on foreground', async () => {
  jest.mocked(api).mockRejectedValueOnce(new ApiError(null, 'Network request failed'))
  await mount()
  expect(screen.getByText('ready:-:false:-')).toBeOnTheScreen()
  expect(current.offline).toBe(true)
  expect(handleUnauthorized).not.toHaveBeenCalled()
  jest.mocked(api).mockResolvedValueOnce({ user, needsDisclosure: false }).mockResolvedValueOnce(null)
  await act(async () => { foreground('active') })
  expect(screen.getByText('ready:Learner:false:-')).toBeOnTheScreen()
  expect(current.offline).toBeFalsy()
})

test.each([
  ['no signal', new ApiError(null, 'Network request failed')],
  ['a server error', new ApiError(503, 'Service unavailable')],
])('%s on /session keeps the last confirmed learner signed in', async (_name, failure) => {
  jest.mocked(api).mockResolvedValueOnce({ user, needsDisclosure: false })
    .mockResolvedValueOnce({ name: 'Company', logoUrl: null, accent: '#604080' })
  await mount()
  expect(screen.getByText('ready:Learner:false:#604080')).toBeOnTheScreen()
  jest.mocked(api).mockRejectedValueOnce(failure)
  await act(async () => { await current.refresh() })
  expect(screen.getByText('ready:Learner:false:#604080')).toBeOnTheScreen()
  expect(current.offline).toBe(true)
  expect(handleUnauthorized).not.toHaveBeenCalled()
})

test('a 401 on /session signs the learner out', async () => {
  jest.mocked(api).mockRejectedValueOnce(new ApiError(401, 'Session expired'))
  jest.mocked(handleUnauthorized).mockImplementation(async () => { event('signedOut') })
  await mount()
  expect(handleUnauthorized).toHaveBeenCalledTimes(1)
  expect(screen.getByText('signedOut:-:false:-')).toBeOnTheScreen()
})

test('a failed branding request keeps the session and the last branding', async () => {
  jest.mocked(api).mockResolvedValueOnce({ user, needsDisclosure: false })
    .mockResolvedValueOnce({ name: 'Company', logoUrl: null, accent: '#604080' })
  await mount()
  jest.mocked(api).mockResolvedValueOnce({ user, needsDisclosure: false })
    .mockRejectedValueOnce(new ApiError(500, 'Server error'))
  await act(async () => { await current.refresh() })
  expect(screen.getByText('ready:Learner:false:#604080')).toBeOnTheScreen()
  expect(current.offline).toBeFalsy()
})

test('an accepted disclosure stays accepted on an offline relaunch', async () => {
  jest.mocked(api).mockResolvedValueOnce({ user, needsDisclosure: true }).mockResolvedValueOnce(null)
  const first = await mount()
  await act(async () => { current.setDisclosed() })
  await first.unmount()
  jest.mocked(api).mockRejectedValueOnce(new ApiError(null, 'Network request failed'))
  await mount()
  expect(screen.getByText('ready:Learner:false:-')).toBeOnTheScreen()
})

test('signing out releases every hold on held-link replay', async () => {
  jest.mocked(api).mockResolvedValueOnce({ user, needsDisclosure: false }).mockResolvedValueOnce(null)
  await mount()
  takeHeldTarget()
  holdTarget('/unit/u1')
  deferReplay()
  deferReplay()
  expect(takeReplayTarget()).toBeNull()
  await act(async () => { event('signedOut') })
  expect(takeReplayTarget()).toBe('/unit/u1')
})

test('a render after the token moved, before the changed event, already hides the previous session', async () => {
  jest.mocked(api).mockResolvedValueOnce({ user, needsDisclosure: false }).mockResolvedValueOnce(null)
  await mount()
  expect(screen.getByText('ready:Learner:false:-')).toBeOnTheScreen()
  // auth stores the new bearer one microtask before it emits 'changed'.
  jest.mocked(getToken).mockReturnValue('token-b')
  await act(async () => { current.setDisclosed() })
  expect(screen.getByText('loading:-:false:-')).toBeOnTheScreen()
})

test("a changed event leaves the ready session synchronously and returns only for that bearer's /session", async () => {
  jest.mocked(api).mockResolvedValueOnce({ user, needsDisclosure: false }).mockResolvedValueOnce(null)
  await mount()
  let resolveSession!: (value: unknown) => void
  jest.mocked(api).mockReturnValueOnce(new Promise((resolve) => { resolveSession = resolve })).mockResolvedValueOnce(null)
  jest.mocked(getToken).mockReturnValue('token-b')
  jest.mocked(loadToken).mockResolvedValue('token-b')
  await act(async () => { event('changed') })
  expect(screen.getByText('loading:-:false:-')).toBeOnTheScreen()
  await act(async () => { resolveSession({ user: { ...user, id: 'u2', name: 'Bo' }, needsDisclosure: false }) })
  expect(screen.getByText('ready:Bo:false:-')).toBeOnTheScreen()
})
