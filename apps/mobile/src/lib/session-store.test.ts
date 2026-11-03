import { createElement } from 'react'
import { Text } from 'react-native'
import { act, render, screen } from '@testing-library/react-native'
import { api } from './api'
import { getToken, handleUnauthorized, loadToken, subscribeAuth } from './auth'
import { SessionProvider, useSession } from './session-store'
import { deferReplay, holdTarget, takeHeldTarget, takeReplayTarget } from './held-target'

jest.mock('./api', () => ({ api: jest.fn() }))
jest.mock('./auth', () => ({ getToken: jest.fn(), loadToken: jest.fn(), handleUnauthorized: jest.fn(), subscribeAuth: jest.fn() }))

let current: ReturnType<typeof useSession>
let event: (type: 'changed' | 'signedOut') => void
const user = { id: 'u1', name: 'Learner', isAnonymous: false }
function Probe() {
  current = useSession()
  return createElement(Text, null, `${current.status}:${current.user?.name ?? '-'}:${current.needsDisclosure}:${current.branding?.accent ?? '-'}`)
}
function mount() { return render(createElement(SessionProvider, { children: createElement(Probe) })) }

beforeEach(() => {
  jest.resetAllMocks()
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

test('offline startup resolves the splash gate and supports a later retry', async () => {
  jest.mocked(api).mockRejectedValueOnce(new Error('Offline'))
  await mount()
  expect(screen.getByText('signedOut:-:false:-')).toBeOnTheScreen()
  jest.mocked(api).mockResolvedValueOnce({ user, needsDisclosure: false }).mockResolvedValueOnce(null)
  await act(async () => { await current.refresh() })
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
