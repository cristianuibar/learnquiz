import * as SecureStore from 'expo-secure-store'
import { authCall } from './api'
import * as kv from './kv'

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }))
jest.mock('./api', () => ({ authCall: jest.fn() }))
jest.mock('./kv', () => ({ clearPrefix: jest.fn() }))

let auth: typeof import('./auth')
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
  jest.mocked(SecureStore.setItemAsync).mockResolvedValue()
  jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue()
  jest.mocked(kv.clearPrefix).mockResolvedValue()
  jest.mocked(authCall).mockResolvedValue({ data: {}, token: 'new-token' })
  jest.isolateModules(() => { auth = require('./auth') })
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
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(1)
  await auth.signIn('learner@example.com', 'password')
  await auth.handleUnauthorized()
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(2)
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
