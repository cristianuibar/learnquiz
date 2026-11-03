import type { InviteView } from '@learnquiz/api/invite'
import { networkError } from '@learnquiz/api/system-copy'
import { ApiError } from './api'
import {
  accountExists,
  canSubmit,
  createJoinFlow,
  decideJoinNavigation,
  inviteScreen,
  joinFailed,
  loadInvite,
  TODAY,
  WELCOME,
  type JoinApi,
  type JoinInput,
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
    ...overrides,
  }
}

// One attempt, as the screen runs it.
function attempt(flow: ReturnType<typeof createJoinFlow>, input: JoinInput, signedIn: boolean) {
  return flow.run(input, signedIn, flow.begin())
}

describe('sequence', () => {
  test('signs up, accepts and reports that the disclosure is needed', async () => {
    const api = fakeApi()
    const outcome = await attempt(createJoinFlow(api, 'inv-1'), form, false)
    expect(api.signUp).toHaveBeenCalledWith(invite.email, 'correct horse', 'Jordan Reyes')
    expect(api.accept).toHaveBeenCalledWith('inv-1')
    expect(outcome).toEqual({ kind: 'done', needsDisclosure: true })
  })

  test('reports when the disclosure is not needed', async () => {
    const api = fakeApi({ session: jest.fn(async () => ({ needsDisclosure: false })) })
    expect(await attempt(createJoinFlow(api, 'inv-1'), form, false)).toEqual({ kind: 'done', needsDisclosure: false })
  })

  test('a failed accept after sign-up retries the accept only', async () => {
    const accept = jest.fn()
      .mockRejectedValueOnce(new ApiError(403, 'You are not the recipient of the invitation'))
      .mockResolvedValueOnce({})
    const api = fakeApi({ accept })
    const flow = createJoinFlow(api, 'inv-1')

    expect(await attempt(flow, form, false)).toEqual({ kind: 'error', message: 'You are not the recipient of the invitation' })
    expect(flow.authenticated).toBe(true)
    expect(await attempt(flow, form, false)).toEqual({ kind: 'done', needsDisclosure: true })
    expect(api.signUp).toHaveBeenCalledTimes(1)
    expect(accept).toHaveBeenCalledTimes(2)
  })

  test('a 401 on accept forgets the sign-in, so the retry signs in again', async () => {
    const accept = jest.fn().mockRejectedValueOnce(new ApiError(401, 'Unauthorized')).mockResolvedValueOnce({})
    const api = fakeApi({ accept })
    const flow = createJoinFlow(api, 'inv-1')

    const first = await attempt(flow, form, false)
    expect(first).toEqual({ kind: 'error', message: 'Unauthorized', mode: 'signIn' })
    expect(flow.authenticated).toBe(false)

    expect(await attempt(flow, { ...form, mode: 'signIn' }, false)).toEqual({ kind: 'done', needsDisclosure: true })
    expect(api.signUp).toHaveBeenCalledTimes(1)
    expect(api.signIn).toHaveBeenCalledWith(invite.email, 'correct horse')
    expect(accept).toHaveBeenCalledTimes(2)
  })

  test('sign-out forgets the sign-in but not the accepted invite', async () => {
    const api = fakeApi({ session: jest.fn().mockRejectedValueOnce(new ApiError(null, 'Network request failed')).mockResolvedValueOnce({ needsDisclosure: false }) })
    const flow = createJoinFlow(api, 'inv-1')
    expect(await attempt(flow, form, false)).toEqual({ kind: 'error', message: networkError })
    flow.signedOut()
    expect(flow.authenticated).toBe(false)
    expect(await attempt(flow, { ...form, mode: 'signIn' }, false)).toEqual({ kind: 'done', needsDisclosure: false })
    expect(api.signIn).toHaveBeenCalledTimes(1)
    expect(api.accept).toHaveBeenCalledTimes(1)
  })

  test('api.ts signs out before rejecting a 401: the attempt goes stale and the retry signs in', async () => {
    const accept = jest.fn()
    const api = fakeApi({ accept })
    const flow = createJoinFlow(api, 'inv-1')
    accept
      .mockImplementationOnce(async () => { flow.signedOut(); throw new ApiError(401, 'Unauthorized') })
      .mockResolvedValueOnce({})
    expect(await attempt(flow, form, false)).toEqual({ kind: 'stale' })
    expect(flow.authenticated).toBe(false)
    expect(await attempt(flow, { ...form, mode: 'signIn' }, false)).toEqual({ kind: 'done', needsDisclosure: true })
    expect(api.signIn).toHaveBeenCalledTimes(1)
  })

  test('a sign-in that lands after a sign-out is not cached', async () => {
    let finish!: () => void
    const api = fakeApi({ signUp: jest.fn(() => new Promise<void>((resolve) => { finish = resolve })) })
    const flow = createJoinFlow(api, 'inv-1')
    const running = attempt(flow, form, false)
    flow.signedOut()
    finish()
    expect(await running).toEqual({ kind: 'stale' })
    expect(flow.authenticated).toBe(false)
    expect(api.accept).not.toHaveBeenCalled()
  })

  test('a newer attempt makes the older one stale', async () => {
    let finish!: () => void
    const api = fakeApi({ accept: jest.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve })).mockResolvedValue({}) })
    const flow = createJoinFlow(api, 'inv-1')
    const older = flow.begin()
    const running = flow.run(form, true, older)
    const newer = flow.begin()
    expect(flow.isLive(older)).toBe(false)
    expect(flow.isLive(newer)).toBe(true)
    finish()
    expect(await running).toEqual({ kind: 'stale' })
  })

  test('a failed accept without a server message shows the fallback copy', async () => {
    const api = fakeApi({ accept: jest.fn().mockRejectedValue(new ApiError(500, 'Request failed with status 500')) })
    expect(await attempt(createJoinFlow(api, 'inv-1'), form, false)).toEqual({ kind: 'error', message: joinFailed })
  })

  test('skips sign-up when already signed in', async () => {
    const api = fakeApi()
    await attempt(createJoinFlow(api, 'inv-1'), form, true)
    expect(api.signUp).not.toHaveBeenCalled()
    expect(api.signIn).not.toHaveBeenCalled()
    expect(api.accept).toHaveBeenCalledTimes(1)
  })

  test('USER_ALREADY_EXISTS switches to sign-in with the message', async () => {
    const error = Object.assign(new ApiError(422, 'User already exists. Use another email.'), { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' })
    const api = fakeApi({ signUp: jest.fn().mockRejectedValue(error) })
    expect(await attempt(createJoinFlow(api, 'inv-1'), form, false)).toEqual({ kind: 'error', message: accountExists, mode: 'signIn' })
    expect(api.accept).not.toHaveBeenCalled()
  })

  test('the existing-account message is recognised without a code', async () => {
    const api = fakeApi({ signUp: jest.fn().mockRejectedValue(new ApiError(422, 'User already exists. Use another email.')) })
    expect(await attempt(createJoinFlow(api, 'inv-1'), form, false)).toEqual({ kind: 'error', message: accountExists, mode: 'signIn' })
  })

  test('other sign-up failures keep the mode', async () => {
    const api = fakeApi({ signUp: jest.fn().mockRejectedValue(new ApiError(422, 'Failed to create user')) })
    expect(await attempt(createJoinFlow(api, 'inv-1'), form, false)).toEqual({ kind: 'error', message: 'Failed to create user' })
  })

  test('wrong credentials show the server message', async () => {
    const api = fakeApi({ signIn: jest.fn().mockRejectedValue(new ApiError(401, 'Invalid email or password')) })
    const outcome = await attempt(createJoinFlow(api, 'inv-1'), { ...form, mode: 'signIn' }, false)
    expect(outcome).toEqual({ kind: 'error', message: 'Invalid email or password' })
    expect(api.accept).not.toHaveBeenCalled()
  })

  test('no response maps to the network copy', async () => {
    const api = fakeApi({ signUp: jest.fn().mockRejectedValue(new ApiError(null, 'Network request failed')) })
    expect(await attempt(createJoinFlow(api, 'inv-1'), form, false)).toEqual({ kind: 'error', message: networkError })
  })

  test('signing in to an already used invite skips the accept', async () => {
    const api = fakeApi({ session: jest.fn(async () => ({ needsDisclosure: false })) })
    const outcome = await attempt(createJoinFlow(api, 'inv-1'), { ...form, mode: 'signIn', accept: false }, false)
    expect(api.signIn).toHaveBeenCalledWith(invite.email, 'correct horse')
    expect(api.accept).not.toHaveBeenCalled()
    expect(outcome).toEqual({ kind: 'done', needsDisclosure: false })
  })
})

describe('decideJoinNavigation', () => {
  const ready = { status: 'ready' as const, needsDisclosure: false }
  const check = { live: true, focused: true, session: ready, held: null }

  test('the Disclosure comes first when it is needed', () => {
    expect(decideJoinNavigation({ needsDisclosure: true }, { ...check, session: { ...ready, needsDisclosure: true }, held: '/unit/u1' }))
      .toEqual({ kind: 'navigate', target: WELCOME, takesHeld: false })
  })

  test('without the Disclosure: Today, or the held link when one is waiting', () => {
    expect(decideJoinNavigation({ needsDisclosure: false }, check)).toEqual({ kind: 'navigate', target: TODAY, takesHeld: false })
    expect(decideJoinNavigation({ needsDisclosure: false }, { ...check, held: '/unit/u1' }))
      .toEqual({ kind: 'navigate', target: '/unit/u1', takesHeld: true })
  })

  test('a held link that cannot open goes to Today and stays held', () => {
    expect(decideJoinNavigation({ needsDisclosure: false }, { ...check, held: '/sign-in' }))
      .toEqual({ kind: 'navigate', target: TODAY, takesHeld: false })
  })

  test('a blurred join screen keeps the result and does not navigate', () => {
    expect(decideJoinNavigation({ needsDisclosure: false }, { ...check, focused: false, held: '/unit/u1' })).toEqual({ kind: 'keep' })
  })

  test('a newer attempt or a sign-out drops the result', () => {
    expect(decideJoinNavigation({ needsDisclosure: false }, { ...check, live: false })).toEqual({ kind: 'drop' })
    expect(decideJoinNavigation({ needsDisclosure: true }, { ...check, live: false, focused: false })).toEqual({ kind: 'drop' })
  })

  test('waits for the session store to catch up', () => {
    expect(decideJoinNavigation({ needsDisclosure: false }, { ...check, session: { ...ready, needsDisclosure: true } })).toEqual({ kind: 'keep' })
    expect(decideJoinNavigation({ needsDisclosure: true }, { ...check, session: { status: 'loading', needsDisclosure: false } })).toEqual({ kind: 'keep' })
  })

  test('a store that went signed out without a sign-out is offline', () => {
    expect(decideJoinNavigation({ needsDisclosure: false }, { ...check, session: { status: 'signedOut', needsDisclosure: false } }))
      .toEqual({ kind: 'offline' })
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
