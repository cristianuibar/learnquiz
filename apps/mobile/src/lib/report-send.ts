export type SendPhase = 'idle' | 'sending' | 'sent' | 'failed'

export type SendState = { phase: SendPhase }

export const initialSendState: SendState = { phase: 'idle' }

/** Send is allowed with a reason, and only from idle or after a failure (retry). */
export function canSend(state: SendState, reason: string | null): boolean {
  if (reason === null) return false
  return state.phase === 'idle' || state.phase === 'failed'
}

/** Back, Cancel and Android Back are blocked only while a request is in flight. */
export function canLeave(state: SendState): boolean {
  return state.phase !== 'sending'
}

/** The button shows busy while sending and stays busy after success. */
export function sendBusy(state: SendState): boolean {
  return state.phase === 'sending' || state.phase === 'sent'
}

export function sendFailed(state: SendState): boolean {
  return state.phase === 'failed'
}

/** Refuses (started: false) unless canSend allows it, so a second send is a no-op. */
export function startSend(state: SendState, reason: string | null): { state: SendState; started: boolean } {
  if (!canSend(state, reason)) return { state, started: false }
  return { state: { phase: 'sending' }, started: true }
}

/** Settles an in-flight send. onSent is owed only on the transition to sent. */
export function settleSend(state: SendState, ok: boolean): { state: SendState; notifySent: boolean } {
  if (state.phase !== 'sending') return { state, notifySent: false }
  if (ok) return { state: { phase: 'sent' }, notifySent: true }
  return { state: { phase: 'failed' }, notifySent: false }
}
