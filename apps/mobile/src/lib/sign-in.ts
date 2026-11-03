import { networkError } from '@learnquiz/api/system-copy'
import { createJoinFlow, decideJoinNavigation, signInFailed, type GateState, type JoinApi, type JoinOutcome } from './join'

export type SignInState = { busy: boolean; error: string | null }

type Effects = {
  refresh(): Promise<void>
  holdReplay(): void
  peekHeldTarget(): string | null
  takeHeldTarget(): string | null
  replace(target: string): void
  changed(state: SignInState): void
  settled(): void
}

// The screen supplies network and UI effects. Reuse Join's sign-in/session
// sequence and attempt tokens, with invitation acceptance disabled.
export function createSignInFlow(api: JoinApi, effects: Effects) {
  const account = createJoinFlow(api, '')
  let mounted = true
  let focused = false
  let session: GateState = { status: 'signedOut', needsDisclosure: false }
  let state: SignInState = { busy: false, error: null }
  let pending: { token: number; outcome: Exclude<JoinOutcome, { kind: 'stale' }> } | null = null

  function publish() {
    if (mounted && focused) effects.changed(state)
  }

  function flush() {
    if (!mounted || !focused || !pending) return
    const { token, outcome } = pending
    if (!account.isLive(token)) { pending = null; return }
    if (outcome.kind === 'error') {
      pending = null
      state = { busy: false, error: outcome.message }
      publish()
      return
    }
    const decision = decideJoinNavigation(outcome, {
      live: account.isLive(token), focused, session, held: effects.peekHeldTarget(),
    })
    if (decision.kind === 'keep') return
    pending = null
    if (decision.kind === 'drop') return
    if (decision.kind === 'offline') {
      state = { busy: false, error: networkError }
      publish()
      return
    }
    // Consume only an openable held link, while replay is still held. Leaving
    // the screen releases replay so the layout can handle any remaining link.
    if (decision.takesHeld) effects.takeHeldTarget()
    effects.replace(decision.target)
  }

  return {
    update(next: { focused: boolean; session: GateState }) {
      if (!mounted) return
      focused = next.focused
      session = next.session
      publish()
      flush()
    },
    async submit(email: string, password: string): Promise<void> {
      if (!mounted || !focused || state.busy || !email.trim() || !password) return
      state = { busy: true, error: null }
      pending = null
      effects.holdReplay()
      // Unlike an invite retry, editable credentials may name another account.
      account.signedOut()
      const token = account.begin()
      publish()
      const live = () => mounted && account.isLive(token)
      const outcome = await account.run({ mode: 'signIn', email: email.trim(), name: '', password, accept: false }, false, token)
      if (!live() || outcome.kind === 'stale') return
      if (outcome.kind === 'done') {
        await effects.refresh()
        if (!live()) return
      }
      pending = { token, outcome }
      // Let the screen commit the refreshed session before deciding navigation.
      // A blurred screen picks up this pending result when it regains focus.
      if (focused) effects.settled()
    },
    signedOut() {
      if (!mounted) return
      account.signedOut()
      pending = null
      state = { busy: false, error: state.busy ? signInFailed : null }
      publish()
    },
    dispose() {
      mounted = false
      account.signedOut()
      pending = null
    },
  }
}
