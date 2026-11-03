import { getConceptItems, getTopicPath } from '@/server/curriculum'
import { generateConceptDiagram } from '@/server/diagrams'
import { flagResult } from '@/server/flags'
import { getInvite } from '@/server/org'
import { getCompanyBranding } from '@/server/org-settings'
import { answerItem, endSession, getSession, nextItem, reportItem, startMiniSession, startPlacement, startSession } from '@/server/play'
import { getProfile } from '@/server/profile'
import { getPushSettings, savePushPreferences, subscribeExpo, unsubscribe } from '@/server/push'
import { acceptDisclosure, getSessionFn } from '@/server/session-fn'
import { getToday } from '@/server/today'

// JSON API for native clients over the app's server functions, authenticated with Authorization: Bearer (the bearer plugin in auth-core).

type ServerFn = (options: { data: never }) => Promise<unknown>
type V1Route = { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; pattern: string; fn: ServerFn; public?: boolean }

export const V1_PREFIX = '/api/v1'

export const v1Routes: V1Route[] = [
  { method: 'GET', pattern: '/session', fn: getSessionFn },
  { method: 'POST', pattern: '/disclosure', fn: acceptDisclosure },
  // Public: the invitee may not have an account yet; a sent bearer still tells the invite who is viewing.
  { method: 'GET', pattern: '/invites/:id', fn: getInvite, public: true },
  { method: 'GET', pattern: '/branding', fn: getCompanyBranding },
  { method: 'GET', pattern: '/today', fn: getToday },
  { method: 'POST', pattern: '/topics/:topicId/placement', fn: startPlacement },
  { method: 'POST', pattern: '/topics/:topicId/sessions', fn: startSession },
  { method: 'POST', pattern: '/sessions/quick', fn: startMiniSession },
  { method: 'GET', pattern: '/sessions/:sessionId', fn: getSession },
  { method: 'POST', pattern: '/sessions/:sessionId/answer', fn: answerItem },
  { method: 'POST', pattern: '/sessions/:sessionId/next', fn: nextItem },
  { method: 'POST', pattern: '/sessions/:sessionId/end', fn: endSession },
  { method: 'POST', pattern: '/items/:itemId/report', fn: reportItem },
  { method: 'POST', pattern: '/concepts/:conceptId/diagram', fn: generateConceptDiagram },
  { method: 'GET', pattern: '/topics/:topicId/path', fn: getTopicPath },
  { method: 'GET', pattern: '/concepts/:conceptId/items', fn: getConceptItems },
  { method: 'POST', pattern: '/me/result-flags', fn: flagResult },
  // Always the caller's own profile: a learner can never read another learner's profile through this API.
  { method: 'GET', pattern: '/me/profile', fn: () => getProfile({ data: {} }) },
  { method: 'GET', pattern: '/push/settings', fn: getPushSettings },
  { method: 'PUT', pattern: '/push/preferences', fn: savePushPreferences },
  { method: 'PUT', pattern: '/push/expo', fn: subscribeExpo },
  { method: 'DELETE', pattern: '/push/expo', fn: unsubscribe },
]

function match(pattern: string, path: string): Record<string, string> | null {
  const want = pattern.split('/')
  const got = path.split('/')
  if (want.length !== got.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(':')) {
      if (!got[i]) return null
      try {
        params[want[i].slice(1)] = decodeURIComponent(got[i])
      } catch {
        return null
      }
    } else if (want[i] !== got[i]) return null
  }
  return params
}

// Start rethrows a failed validator as a plain Error whose message is the JSON issue list; a ZodError thrown in a handler carries issues itself.
function isValidationError(e: { issues?: unknown; message?: unknown }): boolean {
  if (Array.isArray(e?.issues)) return true
  try {
    const issues: unknown = JSON.parse(String(e?.message))
    return Array.isArray(issues) && issues.length > 0 && issues.every((i) => typeof i?.message === 'string' && Array.isArray(i?.path))
  } catch {
    return false
  }
}

const json = (body: unknown, status = 200) => Response.json(body ?? null, { status })

export async function handleV1(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.slice(V1_PREFIX.length).replace(/\/+$/, '') || '/'
  let route: V1Route | undefined
  let params: Record<string, string> | null = null
  for (const r of v1Routes) {
    if (r.method !== request.method) continue
    params = match(r.pattern, path)
    if (params) {
      route = r
      break
    }
  }
  if (!route || !params) return json({ error: 'Not found' }, 404)
  if (!route.public && !/^bearer\s+\S/i.test(request.headers.get('authorization') ?? '')) return json({ error: 'Unauthorized' }, 401)

  let input: Record<string, unknown>
  if (request.method === 'GET') input = Object.fromEntries(url.searchParams)
  else {
    const text = await request.text()
    let body: unknown
    try {
      body = text ? JSON.parse(text) : {}
    } catch {
      return json({ error: 'Invalid JSON body' }, 400)
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return json({ error: 'Body must be a JSON object' }, 400)
    input = body as Record<string, unknown>
  }

  try {
    return json(await route.fn({ data: { ...input, ...params } as never }))
  } catch (e) {
    const err = e as { status?: number; issues?: unknown; message?: string }
    const status = typeof err?.status === 'number' ? err.status : isValidationError(err) ? 400 : 500
    // An unexpected failure keeps its details in the server log, not in the response.
    if (status >= 500) console.error('api/v1', request.method, path, e)
    return json({ error: status >= 500 && typeof err?.status !== 'number' ? 'Internal error' : (err?.message ?? 'Error') }, status)
  }
}
