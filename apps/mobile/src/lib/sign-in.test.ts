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
    peekHeldTarget,
    takeHeldTarget: jest.fn(takeHeldTarget),
    replace: jest.fn(),
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

test.each([
  { needsDisclosure: true, held: '/unit/u1', target: '/welcome', takesHeld: false },
  { needsDisclosure: false, held: '/unit/u1', target: '/unit/u1', takesHeld: true },
  { needsDisclosure: false, held: null, target: '/(tabs)/today', takesHeld: false },
])('success navigates to $target', async ({ needsDisclosure, held, target, takesHeld }) => {
  if (held) holdTarget(held)
  const { api, effects, flow } = setup({ session: jest.fn(async () => ({ needsDisclosure })) })
  flow.update({ focused: true, session: { ...ready, needsDisclosure } })
  await flow.submit(...credentials)
  expect(api.signIn).toHaveBeenCalledWith('learner@example.com', credentials[1])
  expect(api.signUp).not.toHaveBeenCalled()
  expect(api.accept).not.toHaveBeenCalled()
  expect(api.signIn.mock.invocationCallOrder[0]).toBeLessThan(api.session.mock.invocationCallOrder[0])
  expect(api.session.mock.invocationCallOrder[0]).toBeLessThan(effects.refresh.mock.invocationCallOrder[0])
  expect(effects.replace).toHaveBeenCalledTimes(1)
  expect(effects.replace).toHaveBeenCalledWith(target)
  expect(effects.takeHeldTarget).toHaveBeenCalledTimes(takesHeld ? 1 : 0)
  expect(peekHeldTarget()).toBe(takesHeld ? null : held)
})

test('wrong credentials show the server message without fetching a session', async () => {
  const { api, effects, flow } = setup({ signIn: jest.fn().mockRejectedValue({ status: 401, message: 'Invalid email or password' }) })
  await flow.submit(...credentials)
  expect(effects.changed).toHaveBeenLastCalledWith({ busy: false, error: 'Invalid email or password' })
  expect(api.session).not.toHaveBeenCalled()
  expect(effects.replace).not.toHaveBeenCalled()
})

test('no response shows networkError', async () => {
  const { effects, flow } = setup({ signIn: jest.fn().mockRejectedValue({ status: null, message: 'Network request failed' }) })
  await flow.submit(...credentials)
  expect(effects.changed).toHaveBeenLastCalledWith({ busy: false, error: networkError })
  expect(effects.replace).not.toHaveBeenCalled()
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
  expect(effects.replace).toHaveBeenCalledWith('/(tabs)/today')
})

test.each([['', 'password'], ['   ', 'password'], ['learner@example.com', '']])('incomplete credentials cannot submit', async (email, password) => {
  const { api, effects, flow } = setup()
  await flow.submit(email, password)
  expect(api.signIn).not.toHaveBeenCalled()
  expect(effects.holdReplay).not.toHaveBeenCalled()
})

test.each(['signIn', 'session', 'refresh'] as const)('unmount during %s prevents navigation and later UI updates', async (stage) => {
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
  wait.resolve()
  await running
  flow.update({ focused: true, session: ready })
  expect(effects.replace).not.toHaveBeenCalled()
  expect(effects.changed).not.toHaveBeenCalled()
  if (stage === 'signIn') expect(api.session).not.toHaveBeenCalled()
})

test('a second submit while signing in or awaiting navigation makes no request', async () => {
  const wait = deferred<unknown>()
  const { api, effects, flow } = setup({ signIn: jest.fn(() => wait.promise) })
  const running = flow.submit(...credentials)
  await flow.submit(...credentials)
  expect(api.signIn).toHaveBeenCalledTimes(1)
  flow.update({ focused: false, session: ready })
  wait.resolve({})
  await running
  await flow.submit(...credentials)
  expect(api.signIn).toHaveBeenCalledTimes(1)
  expect(effects.replace).not.toHaveBeenCalled()
  flow.update({ focused: true, session: ready })
  expect(effects.replace).toHaveBeenCalledTimes(1)
})

test('success waits for focus and a ready session', async () => {
  const { flow, effects } = setup()
  flow.update({ focused: true, session: { status: 'loading', needsDisclosure: false } })
  await flow.submit(...credentials)
  expect(effects.replace).not.toHaveBeenCalled()
  flow.update({ focused: false, session: ready })
  expect(effects.replace).not.toHaveBeenCalled()
  flow.update({ focused: true, session: ready })
  expect(effects.replace).toHaveBeenCalledWith('/(tabs)/today')
})

test('completion lets the screen commit its refreshed session before navigating', async () => {
  const { flow, effects } = setup()
  flow.update({ focused: true, session: { status: 'signedOut', needsDisclosure: false } })
  effects.settled.mockImplementation(() => {})
  await flow.submit(...credentials)
  expect(effects.replace).not.toHaveBeenCalled()
  expect(effects.changed).toHaveBeenLastCalledWith({ busy: true, error: null })
  flow.update({ focused: true, session: ready })
  expect(effects.replace).toHaveBeenCalledWith('/(tabs)/today')
})

test('sign-out invalidates a pending success, and another sign-in can succeed', async () => {
  const { api, flow, effects } = setup()
  flow.update({ focused: true, session: { status: 'loading', needsDisclosure: false } })
  await flow.submit(...credentials)
  flow.signedOut()
  flow.update({ focused: true, session: ready })
  expect(effects.replace).not.toHaveBeenCalled()
  expect(effects.changed).toHaveBeenLastCalledWith({ busy: false, error: signInFailed })
  await flow.submit(...credentials)
  expect(api.signIn).toHaveBeenCalledTimes(2)
  expect(effects.replace).toHaveBeenCalledWith('/(tabs)/today')
})

test('sign-out during authentication drops the old result', async () => {
  const wait = deferred<unknown>()
  const { api, flow, effects } = setup({ signIn: jest.fn(() => wait.promise) })
  const running = flow.submit(...credentials)
  flow.signedOut()
  wait.resolve({})
  await running
  expect(api.session).not.toHaveBeenCalled()
  expect(effects.replace).not.toHaveBeenCalled()
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
  expect(effects.replace).not.toHaveBeenCalled()
})

test('an unopenable held link remains available to the layout replay on leaving', async () => {
  holdTarget('/(auth)/sign-in?email=other@example.com')
  const { flow, effects, release } = setup()
  const notified = jest.fn()
  const unsubscribe = subscribeReplay(notified)
  await flow.submit(...credentials)
  expect(effects.replace).toHaveBeenCalledWith('/(tabs)/today')
  expect(effects.takeHeldTarget).not.toHaveBeenCalled()
  expect(takeReplayTarget()).toBeNull()
  flow.dispose()
  release()
  expect(notified).toHaveBeenCalledTimes(1)
  expect(takeReplayTarget()).toBe('/(auth)/sign-in?email=other@example.com')
  unsubscribe()
})
