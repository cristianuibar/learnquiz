import * as SecureStore from 'expo-secure-store'
import { Linking } from 'react-native'
import { MOBILE_AUTH_REDIRECT, type FacebookExchange, type FacebookStart } from '@learnquiz/api/mobile-auth'
import { api, authCall } from './api'
import { holdTarget, peekHeldTarget } from './held-target'
import * as kv from './kv'
import { clearPushLocal, observePushForeground, setPushUser, unregisterPush } from './push'

const TOKEN_KEY = 'lq.token'
const FACEBOOK_KEY = 'lq.facebook.pending'
type PendingFacebook = FacebookStart & { invitationId?: string; target: string | null }
let facebookCompletion: { state: string; promise: Promise<void> } | undefined
let token: string | null = null
let revision = 0
let loaded = false
let loading: Promise<string | null> | undefined
let storageWrites: Promise<unknown> = Promise.resolve()
let unauthorized: Promise<void> | undefined
type AuthEvent = 'changed' | 'signedOut'
const listeners = new Set<(event: AuthEvent) => void>()
observePushForeground()

export function getToken() { return token }

export function subscribeAuth(listener: (event: AuthEvent) => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function emit(event: AuthEvent) {
  for (const listener of listeners) listener(event)
}

// Serialize persistence so an old write cannot resurrect a signed-out session.
function persist(write: () => Promise<unknown>) {
  const next = storageWrites.then(write, write)
  storageWrites = next.catch(() => {})
  return next
}

export async function loadToken(): Promise<string | null> {
  if (loaded) return token
  if (!loading) {
    const current = revision
    loading = SecureStore.getItemAsync(TOKEN_KEY).then((stored) => {
      if (revision === current) { token = stored; loaded = true }
      return token
    }).finally(() => { loading = undefined })
  }
  return loading
}

async function storeToken(value: string, current: number, userId: string | null) {
  // Publish only after the token is safely persisted.
  await persist(() => SecureStore.setItemAsync(TOKEN_KEY, value))
  if (current !== revision) return false
  setPushUser(userId)
  token = value
  loaded = true
  unauthorized = undefined
  return true
}

async function clearLocalSession() {
  token = null
  loaded = true
  revision++
  emit('signedOut')
  // Includes drafts, cached Today data, prompts and the locally stored push token.
  await Promise.all([
    persist(() => SecureStore.deleteItemAsync(TOKEN_KEY)),
    persist(() => SecureStore.deleteItemAsync(FACEBOOK_KEY)),
    clearPushLocal().then(() => kv.clearPrefix('lq:')),
  ])
}

export function handleUnauthorized(): Promise<void> {
  // Keep the completed promise until the next login, including late parallel 401s.
  unauthorized ??= clearLocalSession()
  return unauthorized
}

type AuthResult = { token?: string; user?: unknown; [key: string]: unknown }

async function authenticate(path: string, body: Record<string, string>) {
  const current = ++revision
  await persist(() => SecureStore.deleteItemAsync(FACEBOOK_KEY))
  if (current !== revision) return {}
  const { data, token: responseToken } = await authCall<AuthResult>(path, body)
  if (current !== revision) return data
  const nextToken = responseToken ?? data.token
  if (!nextToken) throw new Error('The server did not return a sign-in token.')
  const user = data.user as { id?: unknown } | null | undefined
  const userId = typeof user?.id === 'string' ? user.id : null
  if (await storeToken(nextToken, current, userId)) emit('changed')
  return data
}

export function signIn(email: string, password: string) {
  return authenticate('/sign-in/email', { email, password })
}

export function signUp(email: string, password: string, name: string) {
  return authenticate('/sign-up/email', { email, password, name })
}

export async function acceptInvitation(invitationId: string) {
  const { data } = await authCall('/organization/accept-invitation', { invitationId }, { authenticated: true })
  emit('changed')
  return data
}

export async function signOut() {
  const current = ++revision
  // Unregister while the current bearer still owns this device's subscription.
  const unregistering = unregisterPush()
  if (unregistering) await unregistering
  if (revision !== current) return
  // Start the revocation with the current bearer, but never make local logout wait
  // for the network. Failed revocation does not leave private data on this phone.
  if (token) void authCall('/sign-out', {}, { authenticated: true, timeoutMs: 5_000 }).catch(() => {})
  await clearLocalSession()
}

export async function startFacebookSignIn(invitationId?: string) {
  const current = ++revision
  await persist(() => SecureStore.deleteItemAsync(FACEBOOK_KEY))
  if (current !== revision) return
  const start = await api<FacebookStart>('/auth/facebook/prepare', { body: { redirectUri: MOBILE_AUTH_REDIRECT } })
  if (current !== revision) return
  const pending: PendingFacebook = { ...start, invitationId, target: peekHeldTarget() }
  await persist(() => SecureStore.setItemAsync(FACEBOOK_KEY, JSON.stringify(pending)))
  if (current !== revision) return
  try { await Linking.openURL(start.url) }
  catch (error) {
    await persist(() => SecureStore.deleteItemAsync(FACEBOOK_KEY))
    throw error
  }
}

// Both warm links and a process restarted by the browser land on sign-in. The
// pending proof survives that restart, but never survives logout or email login.
export function finishFacebookSignIn(state: string, code?: string, error?: string): Promise<void> {
  if (facebookCompletion?.state === state) return facebookCompletion.promise
  const promise = completeFacebook(state, code, error).finally(() => {
    if (facebookCompletion?.promise === promise) facebookCompletion = undefined
  })
  facebookCompletion = { state, promise }
  return promise
}

async function completeFacebook(state: string, code?: string, error?: string) {
  const observed = revision
  const stored = await SecureStore.getItemAsync(FACEBOOK_KEY)
  if (observed !== revision) return
  const pending: PendingFacebook | null = stored ? JSON.parse(stored) : null
  if (!pending || pending.state !== state) {
    throw new Error('This Facebook sign-in has expired. Please try again.')
  }
  const current = ++revision
  await persist(() => SecureStore.deleteItemAsync(FACEBOOK_KEY))
  if (current !== revision) return
  if (error || !code) {
    const messages: Record<string, string> = {
      cancelled: 'Facebook sign-in was cancelled. Please try again.',
      not_linked: 'This email already has an account. Sign in with your email and password.',
      banned: 'Your account has been suspended. Sign in with email for details on contacting your company admin.',
      expired: 'This Facebook sign-in has expired. Please try again.',
    }
    throw new Error(messages[error ?? ''] ?? 'Facebook sign-in could not finish. Please try again.')
  }
  const result = await api<FacebookExchange>('/auth/facebook/exchange', {
    body: { code, verifier: pending.verifier, redirectUri: MOBILE_AUTH_REDIRECT },
  })
  if (current !== revision) return
  if (!result.token) throw new Error('The server did not return a sign-in token.')
  if (!await storeToken(result.token, current, result.user.id)) return
  if (pending.target) holdTarget(pending.target)
  if (pending.invitationId) {
    try {
      // Publish the new session only after invite acceptance, as the email flow
      // does. On a mismatch or failed accept, Join explains the next action.
      await authCall('/organization/accept-invitation', { invitationId: pending.invitationId }, { authenticated: true })
    } catch {
      if (current === revision) holdTarget(`/join/${encodeURIComponent(pending.invitationId)}`)
    }
  }
  if (current === revision) emit('changed')
}
