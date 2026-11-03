import type { InviteView } from '@learnquiz/api/invite'
import { networkError } from '@learnquiz/api/system-copy'
import { ApiError } from './api'
import { deferReplay, holdTarget, takeHeldTarget, takeReplayTarget } from './held-target'
import {
  accountExists,
  canSubmit,
  createJoinFlow,
  inviteScreen,
  joinFailed,
  loadInvite,
  TODAY,
  WELCOME,
  type JoinApi,
} from './join'

jest.mock('./auth', () => ({ getToken: () => null, handleUnauthorized: jest.fn() }))

const invite: InviteView = {
  company: 'Northwind Logistics',
  email: 'jordan@northwind.example',
  name: 'Jordan Reyes',
  status: 'pending',
  otherAccount: false,
  roleName: 'Warehouse picker',
  accent: null,
  logoUrl: null,
}
const headline = 'Train as a warehouse picker'
const form = { mode: 'signUp' as const, email: invite.email, name: ' Jordan Reyes ', password: 'correct horse' }

function fakeApi(overrides: Partial<JoinApi> = {}) {
  return {
    signUp: jest.fn(async () => ({})),
    signIn: jest.fn(async () => ({})),
    accept: jest.fn(async () => ({})),
    session: jest.fn(async () => ({ needsDisclosure: true })),
    takeHeldTarget: jest.fn((): string | null => null),
    deferReplay,
    ...overrides,
  }
}

describe('sequence', () => {
  test('signs up, accepts and targets welcome when the disclosure is needed', async () => {
    const api = fakeApi()
    const outcome = await createJoinFlow(api, 'inv-1').run(form, false)
    expect(api.signUp).toHaveBeenCalledWith(invite.email, 'correct horse', 'Jordan Reyes')
    expect(api.accept).toHaveBeenCalledWith('inv-1')
    expect(outcome).toEqual({ kind: 'done', target: WELCOME })
  })

  test('targets Today after accept when the disclosure is not needed', async () => {
    const api = fakeApi({ session: jest.fn(async () => ({ needsDisclosure: false })) })
    expect(await createJoinFlow(api, 'inv-1').run(form, false)).toEqual({ kind: 'done', target: TODAY })
  })

  test('targets the held link instead of Today when one is waiting', async () => {
    const api = fakeApi({
      session: jest.fn(async () => ({ needsDisclosure: false })),
      takeHeldTarget: jest.fn(() => '/unit/u1'),
    })
    expect(await createJoinFlow(api, 'inv-1').run(form, false)).toEqual({ kind: 'done', target: '/unit/u1' })
  })

  test('a failed accept after sign-up retries the accept only', async () => {
    const accept = jest.fn()
      .mockRejectedValueOnce(new ApiError(403, 'You are not the recipient of the invitation'))
      .mockResolvedValueOnce({})
    const api = fakeApi({ accept })
    const flow = createJoinFlow(api, 'inv-1')

    const first = await flow.run(form, false)
    expect(first).toEqual({ kind: 'error', message: 'You are not the recipient of the invitation' })
    expect(flow.authenticated).toBe(true)

    const second = await flow.run(form, false)
    expect(second).toEqual({ kind: 'done', target: WELCOME })
    expect(api.signUp).toHaveBeenCalledTimes(1)
    expect(accept).toHaveBeenCalledTimes(2)
  })

  test('a failed accept without a server message shows the fallback copy', async () => {
    const api = fakeApi({ accept: jest.fn().mockRejectedValue(new ApiError(500, 'Request failed with status 500')) })
    expect(await createJoinFlow(api, 'inv-1').run(form, false)).toEqual({ kind: 'error', message: joinFailed })
  })

  test('skips sign-up when already signed in', async () => {
    const api = fakeApi()
    await createJoinFlow(api, 'inv-1').run(form, true)
    expect(api.signUp).not.toHaveBeenCalled()
    expect(api.signIn).not.toHaveBeenCalled()
    expect(api.accept).toHaveBeenCalledTimes(1)
  })

  test('USER_ALREADY_EXISTS switches to sign-in with the message', async () => {
    const error = Object.assign(new ApiError(422, 'User already exists. Use another email.'), { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' })
    const api = fakeApi({ signUp: jest.fn().mockRejectedValue(error) })
    expect(await createJoinFlow(api, 'inv-1').run(form, false)).toEqual({ kind: 'error', message: accountExists, mode: 'signIn' })
    expect(api.accept).not.toHaveBeenCalled()
  })

  test('the existing-account message is recognised without a code', async () => {
    const api = fakeApi({ signUp: jest.fn().mockRejectedValue(new ApiError(422, 'User already exists. Use another email.')) })
    expect(await createJoinFlow(api, 'inv-1').run(form, false)).toEqual({ kind: 'error', message: accountExists, mode: 'signIn' })
  })

  test('other sign-up failures keep the mode', async () => {
    const api = fakeApi({ signUp: jest.fn().mockRejectedValue(new ApiError(422, 'Failed to create user')) })
    expect(await createJoinFlow(api, 'inv-1').run(form, false)).toEqual({ kind: 'error', message: 'Failed to create user' })
  })

  test('wrong credentials show the server message', async () => {
    const api = fakeApi({ signIn: jest.fn().mockRejectedValue(new ApiError(401, 'Invalid email or password')) })
    const outcome = await createJoinFlow(api, 'inv-1').run({ ...form, mode: 'signIn' }, false)
    expect(outcome).toEqual({ kind: 'error', message: 'Invalid email or password' })
    expect(api.accept).not.toHaveBeenCalled()
  })

  test('no response maps to the network copy', async () => {
    const api = fakeApi({ signUp: jest.fn().mockRejectedValue(new ApiError(null, 'Network request failed')) })
    expect(await createJoinFlow(api, 'inv-1').run(form, false)).toEqual({ kind: 'error', message: networkError })
  })

  test('signing in to an already used invite skips the accept', async () => {
    const api = fakeApi({ session: jest.fn(async () => ({ needsDisclosure: false })) })
    const outcome = await createJoinFlow(api, 'inv-1').run({ ...form, mode: 'signIn', accept: false }, false)
    expect(api.signIn).toHaveBeenCalledWith(invite.email, 'correct horse')
    expect(api.accept).not.toHaveBeenCalled()
    expect(outcome).toEqual({ kind: 'done', target: TODAY })
  })
})

describe('held link while joining', () => {
  beforeEach(() => { takeHeldTarget() })

  test('the root layout cannot replay a held link during sign-up and accept', async () => {
    holdTarget('/unit/u1')
    const seen: (string | null)[] = []
    const api = fakeApi({
      signUp: jest.fn(async () => { seen.push(takeReplayTarget()) }),
      accept: jest.fn(async () => { seen.push(takeReplayTarget()) }),
      session: jest.fn(async () => { seen.push(takeReplayTarget()); return { needsDisclosure: true } }),
      takeHeldTarget,
    })
    const outcome = await createJoinFlow(api, 'inv-1').run(form, false)
    expect(seen).toEqual([null, null, null])
    // The Disclosure comes first; the link is still held for after it.
    expect(outcome).toEqual({ kind: 'done', target: WELCOME })
    expect(takeReplayTarget()).toBe('/unit/u1')
  })

  test('without the Disclosure the flow takes the held link itself', async () => {
    holdTarget('/unit/u1')
    const api = fakeApi({ session: jest.fn(async () => ({ needsDisclosure: false })), takeHeldTarget })
    expect(await createJoinFlow(api, 'inv-1').run(form, false)).toEqual({ kind: 'done', target: '/unit/u1' })
    expect(takeReplayTarget()).toBeNull()
  })

  test('a failed accept keeps the retry state and the held link while the screen holds replay', async () => {
    holdTarget('/unit/u1')
    const screenHold = deferReplay()
    const accept = jest.fn().mockRejectedValueOnce(new ApiError(500, 'Request failed with status 500')).mockResolvedValueOnce({})
    const api = fakeApi({ accept, session: jest.fn(async () => ({ needsDisclosure: true })), takeHeldTarget })
    const flow = createJoinFlow(api, 'inv-1')

    expect(await flow.run(form, false)).toEqual({ kind: 'error', message: joinFailed })
    expect(flow.authenticated).toBe(true)
    // A session refresh landing now must not navigate away from the retry.
    expect(takeReplayTarget()).toBeNull()

    expect(await flow.run(form, false)).toEqual({ kind: 'done', target: WELCOME })
    expect(api.signUp).toHaveBeenCalledTimes(1)
    screenHold()
    expect(takeReplayTarget()).toBe('/unit/u1')
  })

  test('a held link replays normally when nothing defers it', () => {
    holdTarget('/unit/u1')
    const release = deferReplay()
    release()
    release()
    expect(takeReplayTarget()).toBe('/unit/u1')
  })
})

describe('loadInvite', () => {
  test('a rejected fetch maps to the network copy', async () => {
    expect(await loadInvite(() => Promise.reject(new ApiError(null, 'Network request failed'))))
      .toEqual({ kind: 'failed', message: networkError })
  })

  test('a server error maps to the network copy', async () => {
    expect(await loadInvite(() => Promise.reject(new ApiError(500, 'Internal error'))))
      .toEqual({ kind: 'failed', message: networkError })
  })

  test('an unknown id (null body) or a malformed one is invalid', async () => {
    expect(await loadInvite(async () => null)).toEqual({ kind: 'invalid' })
    expect(await loadInvite(() => Promise.reject(new ApiError(400, 'Invalid')))).toEqual({ kind: 'invalid' })
  })

  test('a found invite is returned', async () => {
    expect(await loadInvite(async () => invite)).toEqual({ kind: 'found', invite })
  })
})

describe('inviteScreen', () => {
  const jordan = { name: 'Jordan Reyes' }
  const sam = { name: 'Sam Lee' }

  test('pending and signed out shows the form under the headline', () => {
    expect(inviteScreen(invite, null, headline)).toEqual({ orgRow: true, title: headline, body: null, action: { kind: 'form' } })
  })

  test('pending and signed in as the invitee offers to join', () => {
    expect(inviteScreen(invite, jordan, headline).action).toEqual({ kind: 'join', label: 'Join Northwind Logistics' })
  })

  test('pending and signed in as someone else offers to switch account', () => {
    expect(inviteScreen({ ...invite, otherAccount: true }, sam, headline)).toEqual({
      orgRow: true,
      title: headline,
      body: 'You’re signed in as Sam Lee. This invite is for jordan@northwind.example.',
      action: { kind: 'switchAccount', label: 'Sign in as jordan@northwind.example' },
    })
  })

  test('accepted offers sign-in when signed out and Today to the invitee', () => {
    const used = { ...invite, status: 'accepted' as const }
    expect(inviteScreen(used, null, headline)).toEqual({
      orgRow: true,
      title: 'This invite was already used',
      body: null,
      action: { kind: 'signIn', label: 'Sign in as jordan@northwind.example' },
    })
    expect(inviteScreen(used, jordan, headline).action).toEqual({ kind: 'today', label: 'Continue to Today' })
    expect(inviteScreen({ ...used, otherAccount: true }, sam, headline).action).toEqual({ kind: 'none' })
  })

  test.each([
    ['expired', 'This invite has expired'],
    ['canceled', 'This invite was revoked'],
    ['rejected', 'This invite was declined'],
  ] as const)('%s has its own heading and no action', (status, title) => {
    for (const viewer of [null, jordan]) {
      expect(inviteScreen({ ...invite, status }, viewer, headline)).toEqual({
        orgRow: true, title, body: 'Ask your company for a new one.', action: { kind: 'none' },
      })
    }
  })

  test('not found has no org row', () => {
    expect(inviteScreen(null, null, headline)).toEqual({
      orgRow: false,
      title: 'This invite link isn’t valid',
      body: 'Ask your company to send it again.',
      action: { kind: 'none' },
    })
  })
})

describe('canSubmit', () => {
  test('create account needs a name and 8 characters', () => {
    expect(canSubmit('signUp', 'Jordan', '1234567')).toBe(false)
    expect(canSubmit('signUp', 'Jordan', '12345678')).toBe(true)
    expect(canSubmit('signUp', '   ', '12345678')).toBe(false)
  })

  test('sign in needs only a password', () => {
    expect(canSubmit('signIn', '', '1')).toBe(true)
    expect(canSubmit('signIn', '', '')).toBe(false)
  })
})
