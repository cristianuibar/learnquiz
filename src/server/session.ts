import { getRequestHeaders } from '@tanstack/react-start/server'
import { getAuth } from '@/server/auth'

export async function getSessionUser() {
  const session = await getAuth().api.getSession({ headers: getRequestHeaders() })
  return session?.user ?? null
}

export async function getLearnerId(): Promise<string | null> {
  return (await getSessionUser())?.id ?? null
}

export async function requireLearnerId(): Promise<string> {
  const id = await getLearnerId()
  if (!id) throw Object.assign(new Error('Sign in first'), { status: 401 })
  return id
}
