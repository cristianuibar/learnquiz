// Join by invite: the invite-state mapping and the sign-up -> accept -> session
// sequence. Pure: no React Native imports, the network calls are injected.
import type { InviteView } from '@learnquiz/api/invite'
import { networkError } from '@learnquiz/api/system-copy'

export type AuthMode = 'signUp' | 'signIn'

export const TODAY = '/(tabs)/today'
export const WELCOME = '/welcome'

export const accountExists = 'This email already has an account. Sign in instead.'
export const joinFailed = 'Couldn’t join. Try again.'
export const signInFailed = 'Couldn’t sign in. Try again.'

// Errors from src/lib/api.ts (ApiError) carry status (null without a response)
// and message. Better Auth also sends a code, which ApiError does not keep.
type FailureLike = { status?: number | null; message?: unknown; code?: unknown }

function failure(error: unknown): FailureLike {
  return error && typeof error === 'object' ? (error as FailureLike) : {}
}

function noResponse(error: unknown) {
  return failure(error).status == null
}

// The server's message, unless api.ts had to make one up from the status.
function serverMessage(error: unknown): string | null {
  const { message } = failure(error)
  if (typeof message !== 'string' || !message.trim()) return null
  if (/^Request failed with status \d+$/.test(message)) return null
  return message
}

function isAccountExists(error: unknown) {
  const { code } = failure(error)
  if (typeof code === 'string') return code.startsWith('USER_ALREADY_EXISTS')
  // Better Auth 1.7: 422 "User already exists. Use another email."
  return /^User already exists/i.test(serverMessage(error) ?? '')
}

export function canSubmit(mode: AuthMode, name: string, password: string): boolean {
  if (mode === 'signIn') return password.length > 0
  return name.trim().length > 0 && password.length >= 8
}

// ---- Invite fetch -----------------------------------------------------------

export type InviteLoad =
  | { kind: 'found'; invite: InviteView }
  | { kind: 'invalid' }
  | { kind: 'failed'; message: string }

// GET /invites/:id answers 200 null for an unknown id and 400 for a malformed one.
export async function loadInvite(fetchInvite: () => Promise<InviteView | null>): Promise<InviteLoad> {
  try {
    const invite = await fetchInvite()
    return invite ? { kind: 'found', invite } : { kind: 'invalid' }
  } catch (error) {
    const { status } = failure(error)
    if (status === 400 || status === 404) return { kind: 'invalid' }
    return { kind: 'failed', message: networkError }
  }
}

// ---- Invite states ----------------------------------------------------------

export type InviteAction =
  | { kind: 'form' }
  | { kind: 'join'; label: string }
  | { kind: 'switchAccount'; label: string }
  | { kind: 'signIn'; label: string }
  | { kind: 'today'; label: string }
  | { kind: 'none' }

export type InviteScreen = {
  // Org row (logo and company) above the heading.
  orgRow: boolean
  title: string
  body: string | null
  action: InviteAction
}

export type Viewer = { name: string } | null

const closed = {
  expired: 'This invite has expired',
  canceled: 'This invite was revoked',
  rejected: 'This invite was declined',
} as const

export const invalidScreen: InviteScreen = {
  orgRow: false,
  title: 'This invite link isn’t valid',
  body: 'Ask your company to send it again.',
  action: { kind: 'none' },
}

// viewer: the signed-in, non-anonymous account, or null when signed out.
export function inviteScreen(invite: InviteView | null, viewer: Viewer, headline: string): InviteScreen {
  if (!invite) return invalidScreen
  const other = viewer !== null && invite.otherAccount
  const signInAs = `Sign in as ${invite.email}`
  switch (invite.status) {
    case 'pending':
      if (!viewer) return { orgRow: true, title: headline, body: null, action: { kind: 'form' } }
      if (other) {
        return {
          orgRow: true,
          title: headline,
          body: `You’re signed in as ${viewer.name}. This invite is for ${invite.email}.`,
          action: { kind: 'switchAccount', label: signInAs },
        }
      }
      return { orgRow: true, title: headline, body: null, action: { kind: 'join', label: `Join ${invite.company}` } }
    case 'accepted':
      return {
        orgRow: true,
        title: 'This invite was already used',
        body: null,
        action: !viewer ? { kind: 'signIn', label: signInAs }
          : other ? { kind: 'none' }
          : { kind: 'today', label: 'Continue to Today' },
      }
    default:
      return { orgRow: true, title: closed[invite.status], body: 'Ask your company for a new one.', action: { kind: 'none' } }
  }
}

// ---- Sequence ---------------------------------------------------------------

export type JoinApi = {
  signUp(email: string, password: string, name: string): Promise<unknown>
  signIn(email: string, password: string): Promise<unknown>
  accept(invitationId: string): Promise<unknown>
  session(): Promise<{ needsDisclosure: boolean }>
  takeHeldTarget(): string | null
}

export type JoinInput = {
  mode: AuthMode
  email: string
  name: string
  password: string
  // False for an invite that was already used: sign in, then go on.
  accept?: boolean
}

export type JoinOutcome =
  | { kind: 'done'; target: string }
  | { kind: 'error'; message: string; mode?: AuthMode }

export function nextTarget(needsDisclosure: boolean, takeHeld: () => string | null): string {
  if (needsDisclosure) return WELCOME
  return takeHeld() ?? TODAY
}

// One flow per screen. It remembers the steps already done, so a retry after a
// failed accept never signs up a second time.
export function createJoinFlow(api: JoinApi, invitationId: string) {
  let authenticated = false
  let accepted = false

  async function run(input: JoinInput, signedIn: boolean): Promise<JoinOutcome> {
    if (!signedIn && !authenticated) {
      try {
        if (input.mode === 'signUp') await api.signUp(input.email, input.password, input.name.trim())
        else await api.signIn(input.email, input.password)
        authenticated = true
      } catch (error) {
        if (noResponse(error)) return { kind: 'error', message: networkError }
        if (input.mode === 'signUp' && isAccountExists(error)) return { kind: 'error', message: accountExists, mode: 'signIn' }
        return { kind: 'error', message: serverMessage(error) ?? signInFailed }
      }
    }
    if (input.accept !== false && !accepted) {
      try {
        await api.accept(invitationId)
        accepted = true
      } catch (error) {
        return { kind: 'error', message: noResponse(error) ? networkError : serverMessage(error) ?? joinFailed }
      }
    }
    try {
      const { needsDisclosure } = await api.session()
      return { kind: 'done', target: nextTarget(needsDisclosure, api.takeHeldTarget) }
    } catch {
      return { kind: 'error', message: networkError }
    }
  }

  return {
    run,
    // Signed in by this flow: the screen keeps showing the retry, not the form.
    get authenticated() { return authenticated },
  }
}
