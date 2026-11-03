import { networkError } from '@learnquiz/api/system-copy'

export type SessionError = { kind: 'load' | 'check' | 'next'; message: string }

export function sessionRefetchError(current: SessionError | null): SessionError {
  return current?.kind === 'check' ? current : { kind: 'load', message: networkError }
}
