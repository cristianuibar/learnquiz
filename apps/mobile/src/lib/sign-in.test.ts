import { networkError } from '@learnquiz/api/system-copy'
import { createSignInFlow } from './sign-in'
import { signInFailed, type GateState, type JoinApi } from './join'
import { deferReplay, holdTarget, peekHeldTarget, releaseReplayHolds, subscribeReplay, takeHeldTarget, takeReplayTarget } from './held-target'

const ready: GateState = { status: 'ready', needsDisclosure: false }
const credentials = [' learner@example.com ', 'correct password'] as const

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function setup(overrides: Partial<JoinApi> = {}) {
  const api = {
    signIn: jest.fn(overrides.signIn ?? (async () => ({}))),
    signUp: jest.fn(overrides.signUp ?? (async () => ({}))),
    accept: jest.fn(overrides.accept ?? (async () => ({}))),
    session: jest.fn(overrides.session ?? (async () => ({ needsDisclosure: false }))),
  }
  let release = () => {}
  const effects = {
    refresh: jest.fn(async () => {}),
    holdReplay: jest.fn(() => { release = deferReplay() }),
    changed: jest.fn(),
    settled: jest.fn(),
  }
  const controller = createSignInFlow(api, effects)
  let view = { focused: true, session: ready }
  const flow = {
    ...controller,
    update(next: typeof view) { view = next; controller.update(next) },
  }
  // Simulate the screen's effect after a result requests a render.
  effects.settled.mockImplementation(() => controller.update(view))
  flow.update({ focused: true, session: ready })
  return { api, effects, flow, release: () => release() }
}

beforeEach(() => { releaseReplayHolds(); takeHeldTarget() })

test.each([true, false])('success refreshes the store without consuming its held link (Disclosure: %s)', async (needsDisclosure) => {
  holdTarget('/unit/u1')
  const { api, effects, flow } = setup({ session: jest.fn(async () => ({ needsDisclosure })) })
  flow.update({ focused: true, session: { ...ready, needsDisclosure } })
  await flow.submit(...credentials)
  expect(api.signIn).toHaveBeenCalledWith('learner@example.com', credentials[1])
  expect(api.signUp).not.toHaveBeenCalled()
  expect(api.accept).not.toHaveBeenCalled()
  expect(api.signIn.mock.invocationCallOrder[0]).toBeLessThan(api.session.mock.invocationCallOrder[0])
  expect(api.session.mock.invocationCallOrder[0]).toBeLessThan(effects.refresh.mock.invocationCallOrder[0])
  expect(peekHeldTarget()).toBe('/unit/u1')
  expect(effects.changed).toHaveBeenLastCalledWith({ busy: true, error: null })
})

test('wrong credentials show the server message without fetching a session', async () => {
  const { api, effects, flow } = setup({ signIn: jest.fn().mockRejectedValue({ status: 401, message: 'Invalid email or password' }) })
  await flow.submit(...credentials)
  expect(effects.changed).toHaveBeenLastCalledWith({ busy: false, error: 'Invalid email or password' })
  expect(api.session).not.toHaveBeenCalled()
  expect(effects.refresh).not.toHaveBeenCalled()
})

test('no response shows networkError', async () => {
  const { effects, flow } = setup({ signIn: jest.fn().mockRejectedValue({ status: null, message: 'Network request failed' }) })
  await flow.submit(...credentials)
  expect(effects.changed).toHaveBeenLastCalledWith({ busy: false, error: networkError })
  expect(effects.refresh).not.toHaveBeenCalled()
})

test('credentials succeed but an offline session store shows exactly networkError', async () => {
  const { api, effects, flow } = setup()
  flow.update({ focused: true, session: { status: 'signedOut', needsDisclosure: false } })
  await flow.submit(...credentials)
  expect(api.signIn).toHaveBeenCalledTimes(1)
  expect(api.session).toHaveBeenCalledTimes(1)
  expect(effects.refresh).toHaveBeenCalledTimes(1)
  expect(effects.changed).toHaveBeenLastCalledWith({ busy: false, error: networkError })
})

test('retry after a session failure authenticates the current editable credentials', async () => {
  const { api, effects, flow } = setup({ session: jest.fn()
    .mockRejectedValueOnce({ status: null })
    .mockResolvedValueOnce({ needsDisclosure: false }) })
  await flow.submit(...credentials)
  expect(effects.changed).toHaveBeenLastCalledWith({ busy: false, error: networkError })
  await flow.submit('another@example.com', 'another password')
  expect(api.signIn).toHaveBeenCalledTimes(2)
  expect(api.signIn).toHaveBeenLastCalledWith('another@example.com', 'another password')
  expect(effects.refresh).toHaveBeenCalledTimes(1)
})

test.each([['', 'password'], ['   ', 'password'], ['learner@example.com', '']])('incomplete credentials cannot submit', async (email, password) => {
  const { api, effects, flow } = setup()
  await flow.submit(email, password)
  expect(api.signIn).not.toHaveBeenCalled()
  expect(effects.holdReplay).not.toHaveBeenCalled()
})

test.each(['signIn', 'session', 'refresh'] as const)('unmount during %s prevents later UI updates', async (stage) => {
  const wait = deferred<void>()
  const { api, effects, flow } = setup()
  const reached = deferred<void>()
  const call = jest.fn(() => { reached.resolve(); return wait.promise })
  if (stage === 'refresh') effects.refresh.mockImplementation(call)
  else if (stage === 'session') api.session.mockImplementation(async () => { await call(); return { needsDisclosure: false } })
  else api.signIn.mockImplementation(call)
  const running = flow.submit(...credentials)
  await reached.promise
  flow.dispose()
  effects.changed.mockClear()
  effects.settled.mockClear()
  wait.resolve()
  await running
  flow.update({ focused: true, session: ready })
  expect(effects.settled).not.toHaveBeenCalled()
  expect(effects.changed).not.toHaveBeenCalled()
  if (stage === 'signIn') expect(api.session).not.toHaveBeenCalled()
})

test('a second submit while signing in or awaiting navigation makes no request', async () => {
  const wait = deferred<unknown>()
  const { api, effects, flow } = setup({ signIn: jest.fn(() => wait.promise) })
  const running = flow.submit(...credentials)
  await flow.submit(...credentials)
  expect(api.signIn).toHaveBeenCalledTimes(1)
  wait.resolve({})
  await running
  await flow.submit(...credentials)
  expect(api.signIn).toHaveBeenCalledTimes(1)
  expect(effects.changed).toHaveBeenLastCalledWith({ busy: true, error: null })
})

test('an error that settles while blurred waits for focus before updating the UI', async () => {
  const wait = deferred<void>()
  const { flow, effects } = setup({ signIn: jest.fn(async () => { await wait.promise; throw { status: 401, message: 'Invalid email or password' } }) })
  const running = flow.submit(...credentials)
  flow.update({ focused: false, session: ready })
  effects.changed.mockClear()
  wait.resolve()
  await running
  expect(effects.changed).not.toHaveBeenCalled()
  flow.update({ focused: true, session: ready })
  expect(effects.changed).toHaveBeenLastCalledWith({ busy: false, error: 'Invalid email or password' })
})

test('a loading store keeps the submit busy until it settles offline', async () => {
  const { flow, effects } = setup()
  flow.update({ focused: true, session: { status: 'loading', needsDisclosure: false } })
  await flow.submit(...credentials)
  expect(effects.changed).toHaveBeenLastCalledWith({ busy: true, error: null })
  flow.update({ focused: true, session: { status: 'signedOut', needsDisclosure: false } })
  expect(effects.changed).toHaveBeenLastCalledWith({ busy: false, error: networkError })
})

test('completion lets the screen commit the refreshed store before reporting an offline error', async () => {
  const { flow, effects } = setup()
  flow.update({ focused: true, session: { status: 'signedOut', needsDisclosure: false } })
  effects.settled.mockImplementation(() => {})
  await flow.submit(...credentials)
  expect(effects.changed).toHaveBeenLastCalledWith({ busy: true, error: null })
  flow.update({ focused: true, session: ready })
  expect(effects.changed).toHaveBeenLastCalledWith({ busy: true, error: null })
})

test('sign-out invalidates a pending success, and another sign-in can succeed', async () => {
  const { api, flow, effects } = setup()
  flow.update({ focused: true, session: { status: 'loading', needsDisclosure: false } })
  await flow.submit(...credentials)
  flow.signedOut()
  flow.update({ focused: true, session: ready })
  expect(effects.changed).toHaveBeenLastCalledWith({ busy: false, error: signInFailed })
  await flow.submit(...credentials)
  expect(api.signIn).toHaveBeenCalledTimes(2)
  expect(effects.refresh).toHaveBeenCalledTimes(2)
})

test('sign-out during authentication drops the old result', async () => {
  const wait = deferred<unknown>()
  const { api, flow, effects } = setup({ signIn: jest.fn(() => wait.promise) })
  const running = flow.submit(...credentials)
  flow.signedOut()
  wait.resolve({})
  await running
  expect(api.session).not.toHaveBeenCalled()
  expect(effects.refresh).not.toHaveBeenCalled()
})

test('sign-out during refresh drops the result even if the store becomes ready again', async () => {
  const { flow, effects } = setup()
  const wait = deferred<void>()
  const reached = deferred<void>()
  effects.refresh.mockImplementation(() => { reached.resolve(); return wait.promise })
  const running = flow.submit(...credentials)
  await reached.promise
  flow.signedOut()
  flow.update({ focused: true, session: ready })
  wait.resolve()
  await running
  expect(effects.settled).not.toHaveBeenCalled()
})

test('an unopenable held link remains available to the layout replay on leaving', async () => {
  holdTarget('/(auth)/sign-in?email=other@example.com')
  const { flow, effects, release } = setup()
  const notified = jest.fn()
  const unsubscribe = subscribeReplay(notified)
  await flow.submit(...credentials)
  expect(peekHeldTarget()).toBe('/(auth)/sign-in?email=other@example.com')
  expect(takeReplayTarget()).toBeNull()
  flow.dispose()
  release()
  expect(notified).toHaveBeenCalledTimes(1)
  expect(takeReplayTarget()).toBe('/(auth)/sign-in?email=other@example.com')
  unsubscribe()
})
