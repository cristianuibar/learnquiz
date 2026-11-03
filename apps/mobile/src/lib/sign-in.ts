import { networkError } from '@learnquiz/api/system-copy'
import { createJoinFlow, signInFailed, type GateState, type JoinApi, type JoinOutcome } from './join'

export type SignInState = { busy: boolean; error: string | null }

type Effects = {
  refresh(): Promise<void>
  holdReplay(): void
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
    if (outcome.kind === 'error' || session.status === 'signedOut') {
      pending = null
      state = { busy: false, error: outcome.kind === 'error' ? outcome.message : networkError }
      publish()
      return
    }
    // Ready removes the protected auth screen. index then owns the destination;
    // this flow never consumes a held link or tries to navigate after unmount.
    if (session.status === 'ready') pending = null
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
      // Let the screen commit the refreshed store before reporting an offline error.
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
