import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { createAuth } from '@/server/auth-core'

export { facebookEnabled } from '@/server/auth-core'

// The app copies Better Auth cookies into the current TanStack response.
export function getAuth() {
  return createAuth([tanstackStartCookies()])
}
