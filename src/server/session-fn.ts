import { createServerFn } from '@tanstack/react-start'
import { facebookEnabled } from '@/server/auth'
import { getSessionUser } from '@/server/session'

// Lives apart from the request helpers so no server-only import reaches the client bundle.
export const getSessionFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{
    user: { id: string; name: string; isAnonymous: boolean } | null
    facebookEnabled: boolean
  }> => {
    const user = await getSessionUser()
    return {
      user: user && { id: user.id, name: user.name, isAnonymous: Boolean(user.isAnonymous) },
      facebookEnabled: facebookEnabled(),
    }
  },
)
