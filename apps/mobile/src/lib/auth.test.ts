import * as SecureStore from 'expo-secure-store'
import { api, authCall } from './api'
import * as kv from './kv'

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }))
jest.mock('./api', () => ({ api: jest.fn(), authCall: jest.fn() }))
jest.mock('./kv', () => ({ clearPrefix: jest.fn() }))

let auth: typeof import('./auth')
let held: typeof import('./held-target')
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
  jest.mocked(SecureStore.setItemAsync).mockResolvedValue()
  jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue()
  jest.mocked(kv.clearPrefix).mockResolvedValue()
  jest.mocked(authCall).mockResolvedValue({ data: {}, token: 'new-token' })
  jest.isolateModules(() => { auth = require('./auth'); held = require('./held-target') })
})

test('loads the secure token once and signs in with the returned bearer', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue('restored-token')
  await expect(auth.loadToken()).resolves.toBe('restored-token')
  await auth.loadToken()
  expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(1)
  const listener = jest.fn()
  auth.subscribeAuth(listener)
  await auth.signIn('learner@example.com', 'password')
  expect(authCall).toHaveBeenCalledWith('/sign-in/email', { email: 'learner@example.com', password: 'password' })
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('lq.token', 'new-token')
  expect(auth.getToken()).toBe('new-token')
  expect(listener).toHaveBeenCalledWith('changed')
})

test('signs up and refreshes after accepting an invitation', async () => {
  const listener = jest.fn()
  auth.subscribeAuth(listener)
  await auth.signUp('new@example.com', 'password', 'Learner')
  expect(authCall).toHaveBeenCalledWith('/sign-up/email', { email: 'new@example.com', password: 'password', name: 'Learner' })
  await auth.acceptInvitation('invitation-1')
  expect(authCall).toHaveBeenCalledWith('/organization/accept-invitation', { invitationId: 'invitation-1' }, { authenticated: true })
  expect(listener).toHaveBeenCalledTimes(2)
})

test('sign-out resets the session and clears private data while revocation hangs', async () => {
  await auth.signIn('learner@example.com', 'password')
  jest.mocked(authCall).mockReturnValue(new Promise(() => {}))
  const listener = jest.fn()
  auth.subscribeAuth(listener)
  const logout = auth.signOut()
  expect(auth.getToken()).toBeNull()
  expect(listener).toHaveBeenCalledWith('signedOut')
  await logout
  expect(authCall).toHaveBeenLastCalledWith('/sign-out', {}, { authenticated: true, timeoutMs: 5_000 })
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('lq.token')
  expect(kv.clearPrefix).toHaveBeenCalledWith('lq:')
})

test('a rejected revocation still erases the local session', async () => {
  await auth.signIn('learner@example.com', 'password')
  jest.mocked(authCall).mockRejectedValue(new Error('Offline'))
  await auth.signOut()
  expect(auth.getToken()).toBeNull()
  expect(kv.clearPrefix).toHaveBeenCalledWith('lq:')
})

test('parallel and late unauthorized responses reset once until the next login', async () => {
  const listener = jest.fn()
  auth.subscribeAuth(listener)
  await Promise.all([auth.handleUnauthorized(), auth.handleUnauthorized()])
  await auth.handleUnauthorized()
  expect(listener).toHaveBeenCalledTimes(1)
  expect(jest.mocked(SecureStore.deleteItemAsync).mock.calls.filter(([key]) => key === 'lq.token')).toHaveLength(1)
  await auth.signIn('learner@example.com', 'password')
  await auth.handleUnauthorized()
  expect(jest.mocked(SecureStore.deleteItemAsync).mock.calls.filter(([key]) => key === 'lq.token')).toHaveLength(2)
})

test('a pending secure-store read cannot restore the token after sign-out', async () => {
  let resolve!: (value: string) => void
  jest.mocked(SecureStore.getItemAsync).mockReturnValue(new Promise((done) => { resolve = done }))
  const loading = auth.loadToken()
  await auth.signOut()
  resolve('old-token')
  await loading
  expect(auth.getToken()).toBeNull()
})

test('a pending sign-in response cannot restore the token after sign-out', async () => {
  let resolve!: (value: { data: {}; token: string }) => void
  jest.mocked(authCall).mockReturnValue(new Promise((done) => { resolve = done }))
  const login = auth.signIn('learner@example.com', 'password')
  await auth.signOut()
  resolve({ data: {}, token: 'late-token' })
  await login
  expect(auth.getToken()).toBeNull()
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled()
})

test('a Facebook exchange arriving after logout cannot restore the session', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify({ state: 'state', verifier: 'proof', expiresAt: Date.now() + 300_000 }))
  let resolve!: (value: unknown) => void
  jest.mocked(api).mockReturnValue(new Promise((done) => { resolve = done }))
  const completing = auth.finishFacebookSignIn('state', 'code')
  for (let i = 0; i < 10; i++) await Promise.resolve()
  expect(api).toHaveBeenCalled()
  await auth.signOut()
  resolve({ token: 'late-facebook-token', user: { id: 'u1' } })
  await completing
  expect(auth.getToken()).toBeNull()
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled()
})

test('an unsolicited Facebook return cannot exchange or store a bearer', async () => {
  await expect(auth.finishFacebookSignIn('unsolicited', 'code')).rejects.toThrow('expired')
  expect(api).not.toHaveBeenCalled()
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled()
})

test('Facebook never publishes a bearer if SecureStore persistence fails', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify({ state: 'state', verifier: 'proof', expiresAt: Date.now() + 300_000 }))
  jest.mocked(api).mockResolvedValue({ token: 'facebook-token', user: { id: 'u1' } })
  jest.mocked(SecureStore.setItemAsync).mockRejectedValue(new Error('Storage unavailable'))
  const listener = jest.fn()
  auth.subscribeAuth(listener)
  await expect(auth.finishFacebookSignIn('state', 'code')).rejects.toThrow('Storage unavailable')
  expect(auth.getToken()).toBeNull()
  expect(listener).not.toHaveBeenCalledWith('changed')
})


function storedFacebookAttempt(extra = {}) {
  const values = new Map<string, string>([['lq.facebook.pending', JSON.stringify({ state: 'state', verifier: 'proof', expiresAt: 1, target: null, ...extra })]])
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => values.get(key) ?? null)
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { values.set(key, value) })
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => { values.delete(key) })
  jest.mocked(api).mockResolvedValue({ token: 'facebook-token', user: { id: 'u1' } })
}

test('rejects a different state even when a Facebook attempt is stored', async () => {
  storedFacebookAttempt()
  await expect(auth.finishFacebookSignIn('other-state', 'code')).rejects.toThrow('expired')
  expect(api).not.toHaveBeenCalled()
  expect(auth.getToken()).toBeNull()
})

test.each(['logout', 'email sign-in'])('%s invalidates a stored Facebook attempt before the browser returns', async (action) => {
  storedFacebookAttempt()
  if (action === 'logout') await auth.signOut()
  else await auth.signIn('learner@example.com', 'password')
  await expect(auth.finishFacebookSignIn('state', 'code')).rejects.toThrow('expired')
  expect(api).not.toHaveBeenCalled()
  expect(auth.getToken()).toBe(action === 'logout' ? null : 'new-token')
})

test('lets the server enforce expiry when the phone clock is ahead', async () => {
  storedFacebookAttempt() // The server timestamp is already behind this phone.
  await auth.finishFacebookSignIn('state', 'code')
  expect(auth.getToken()).toBe('facebook-token')
})

test('restores the saved target when completing a persisted Facebook attempt', async () => {
  held.holdTarget('/unit/old')
  storedFacebookAttempt({ target: '/unit/saved' })
  await auth.finishFacebookSignIn('state', 'code')
  expect(held.peekHeldTarget()).toBe('/unit/saved')
  held.takeHeldTarget()
})
