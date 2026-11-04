import { createElement, useSyncExternalStore } from 'react'
import { Dimensions, Text } from 'react-native'
import * as Native from 'react-native'
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library'
import { router, Stack } from 'expo-router'
import JoinScreen from './app/join/[invitationId]'
import { ApiError, api } from './lib/api'
import { acceptInvitation, signIn, signUp, subscribeAuth } from './lib/auth'
import { releaseReplayHolds, takeHeldTarget } from './lib/held-target'
import { useSession } from './lib/session-store'
import { ThemeProvider } from './theme/ThemeProvider'

jest.mock('expo-router/build/toolbar/native', () => ({ RouterToolbarHost: 'View', RouterToolbarItem: 'View' }))
jest.mock(require.resolve('expo-glass-effect', { paths: [require.resolve('expo-router')] }), () => ({
  GlassView: 'View', isLiquidGlassAvailable: () => false, isGlassEffectAPIAvailable: () => false,
}))
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: require('react-native').View,
  KeyboardAwareScrollView: require('react-native').ScrollView,
  useKeyboardState: () => false,
}))
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('./lib/api', () => {
  const actual = jest.requireActual('./lib/api')
  return { ApiError: actual.ApiError, api: jest.fn(), mediaSource: jest.fn() }
})
jest.mock('./lib/auth', () => ({
  signUp: jest.fn(), signIn: jest.fn(), signOut: jest.fn(), acceptInvitation: jest.fn(), subscribeAuth: jest.fn(),
}))
jest.mock('./lib/session-store', () => ({ useSession: jest.fn() }))

const invite = {
  company: 'Northwind Logistics', email: 'jordan@northwind.example', name: 'Jordan Reyes', status: 'pending',
  otherAccount: false, roleName: 'Warehouse picker', accent: null, logoUrl: null,
}
const signedOut = { status: 'signedOut' as const, user: null, needsDisclosure: false, branding: null }
const ready = { ...signedOut, status: 'ready' as const, user: { id: 'u1', name: 'Jordan Reyes', isAnonymous: false } }

let snapshot: typeof signedOut | typeof ready = signedOut
const sessionListeners = new Set<() => void>()
const setSession = (next: typeof snapshot) => { snapshot = next; sessionListeners.forEach((listener) => listener()) }
const authListeners = new Set<(event: 'changed' | 'signedOut') => void>()

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const routes = {
  _layout: () => createElement(ThemeProvider, { children: createElement(Stack, { screenOptions: { headerShown: false } }) }),
  'join/[invitationId]': JoinScreen,
  notification: () => createElement(Text, null, 'Notification'),
  '(tabs)/today': () => createElement(Text, null, 'Today'),
}

async function submitCreateAccount() {
  await fireEvent.changeText(await screen.findByLabelText('Create a password'), 'correct horse')
  await fireEvent.press(screen.getByText('Create account'))
}

beforeEach(() => {
  jest.clearAllMocks()
  releaseReplayHolds()
  takeHeldTarget()
  snapshot = signedOut
  sessionListeners.clear()
  authListeners.clear()
  jest.mocked(useSession).mockImplementation(() => {
    const state = useSyncExternalStore(
      (listener) => { sessionListeners.add(listener); return () => { sessionListeners.delete(listener) } },
      () => snapshot,
    )
    return { ...state, refresh: async () => { setSession(ready) }, setDisclosed: jest.fn() }
  })
  jest.mocked(subscribeAuth).mockImplementation((listener) => { authListeners.add(listener); return () => { authListeners.delete(listener) } })
  jest.mocked(api).mockImplementation(async (path: string) => {
    if (path.startsWith('/invites/')) return invite
    if (path === '/session') return { needsDisclosure: false }
    throw new Error(`unexpected ${path}`)
  })
  jest.mocked(signUp).mockResolvedValue({})
  jest.mocked(signIn).mockResolvedValue({})
})

test('Join keeps its prefilled read-only email and mode link with the default AccountForm props', async () => {
  await renderRouter(routes, { initialUrl: '/join/inv-1' })
  const email = await screen.findByLabelText(`Email, ${invite.email}`)
  expect(email).toHaveProp('accessibilityHint', 'Set by your invite')
  expect(screen.queryByLabelText('Email')).toBeNull()
  expect(screen.getByLabelText('Your name')).toHaveProp('value', invite.name)
  expect(screen.getByRole('button', { name: 'Create account' })).toBeOnTheScreen()
  await fireEvent.press(screen.getByText('I already have an account'))
  expect(screen.getByLabelText(`Email, ${invite.email}`)).toBeOnTheScreen()
  expect(screen.queryByLabelText('Email')).toBeNull()
  expect(screen.queryByLabelText('Your name')).toBeNull()
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeOnTheScreen()
  expect(screen.getByText('Create an account')).toBeOnTheScreen()
})

describe.each(['light', 'dark'] as const)('%s join form layout', (scheme) => {
  describe.each([1, 2])('at font scale %s', (fontScale) => {
    test.each([true, false, 'failed'] as const)('keeps the fields in place when Facebook capabilities are %s', async (facebook) => {
      const capabilities = deferred<{ facebook: boolean }>()
      jest.mocked(api).mockImplementation(async (path: string) => {
        if (path.startsWith('/invites/')) return invite
        if (path === '/auth/capabilities') return capabilities.promise
        throw new Error(`unexpected ${path}`)
      })
      const colorScheme = jest.spyOn(Native, 'useColorScheme').mockReturnValue(scheme)
      const windowSize = Dimensions.get('window')
      Dimensions.set({ window: { ...windowSize, width: 320, fontScale } })
      try {
        await renderRouter(routes, { initialUrl: '/join/inv-1' })
        const fields = [
          await screen.findByLabelText(`Email, ${invite.email}`),
          screen.getByLabelText('Your name'),
          screen.getByLabelText('Create a password'),
        ]
        const submit = screen.getByRole('button', { name: 'Create account' })
        // The renderer has no native coordinates. Compare every rendered node
        // through the submit button: an inserted sibling above the form fails.
        const nodes = screen.root!.queryAll(() => true)
        const beforeFormEnd = nodes.slice(0, nodes.indexOf(submit) + 1)
        expect(fields.map((field) => nodes.indexOf(field))).toEqual(
          fields.map((field) => nodes.indexOf(field)).sort((a, b) => a - b),
        )
        expect(screen.queryByRole('button', { name: 'Continue with Facebook' })).toBeNull()

        await act(async () => {
          if (facebook === 'failed') capabilities.reject(new Error('offline'))
          else capabilities.resolve({ facebook })
        })

        const after = screen.root!.queryAll(() => true)
        const afterFormEnd = after.slice(0, after.indexOf(submit) + 1)
        expect(afterFormEnd).toHaveLength(beforeFormEnd.length)
        expect(afterFormEnd.every((node, index) => node === beforeFormEnd[index])).toBe(true)
        if (facebook === true) {
          const button = screen.getByRole('button', { name: 'Continue with Facebook' })
          expect(after.indexOf(button)).toBeGreaterThan(after.indexOf(screen.getByText('I already have an account')))
        } else {
          expect(screen.queryByRole('button', { name: 'Continue with Facebook' })).toBeNull()
          expect(after).toHaveLength(nodes.length)
          expect(after.every((node, index) => node === nodes[index])).toBe(true)
        }
      } finally {
        Dimensions.set({ window: windowSize })
        colorScheme.mockRestore()
      }
    })
  })
})

test('a join that finishes behind a pushed screen does not navigate until Join is back in front', async () => {
  const accept = deferred<unknown>()
  jest.mocked(acceptInvitation).mockReturnValue(accept.promise as never)
  const navigation = renderRouter(routes, { initialUrl: '/join/inv-1' })
  await navigation
  await submitCreateAccount()
  expect(signUp).toHaveBeenCalledWith('jordan@northwind.example', 'correct horse', 'Jordan Reyes')
  expect(acceptInvitation).toHaveBeenCalledWith('inv-1')

  // A notification tap pushes a screen over Join while accept is in flight.
  await act(async () => { router.push('/notification') })
  expect(navigation.getPathname()).toBe('/notification')
  await act(async () => { accept.resolve({}) })
  expect(navigation.getPathname()).toBe('/notification')
  expect(screen.getByText('Notification')).toBeOnTheScreen()

  // Back on Join, the kept result goes on to Today.
  await act(async () => { router.back() })
  expect(navigation.getPathname()).toBe('/today')
})

test('a 401 on accept signs out, returns to sign-in, and the retry signs in again', async () => {
  jest.mocked(acceptInvitation)
    // api.ts signs out on a 401 before it rejects.
    .mockImplementationOnce(async () => {
      setSession(signedOut)
      authListeners.forEach((listener) => listener('signedOut'))
      throw new ApiError(401, 'Unauthorized')
    })
    .mockResolvedValueOnce({} as never)
  const navigation = renderRouter(routes, { initialUrl: '/join/inv-1' })
  await navigation
  await submitCreateAccount()

  expect(await screen.findByText('Couldn’t join. Try again.')).toBeOnTheScreen()
  expect(screen.getByText('Sign in')).toBeOnTheScreen()
  expect(navigation.getPathname()).toBe('/join/inv-1')

  await fireEvent.changeText(screen.getByLabelText('Password'), 'correct horse')
  await fireEvent.press(screen.getByText('Sign in'))
  expect(signIn).toHaveBeenCalledWith('jordan@northwind.example', 'correct horse')
  expect(signUp).toHaveBeenCalledTimes(1)
  expect(acceptInvitation).toHaveBeenCalledTimes(2)
  expect(navigation.getPathname()).toBe('/today')
})
