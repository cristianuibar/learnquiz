import * as SecureStore from 'expo-secure-store'
import { authCall } from './api'
import * as kv from './kv'
import { clearPushLocal, observePushForeground, setPushUser, unregisterPush } from './push'

const TOKEN_KEY = 'lq.token'
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
