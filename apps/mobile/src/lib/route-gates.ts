type GateState = { status: 'loading' | 'signedOut' | 'ready'; needsDisclosure: boolean }

// Keep only app paths. A held link must never become an external redirect.
export function targetFromURL(url: string): string | null {
  try {
    const parsed = new URL(url)
    const path = parsed.protocol === 'learnquiz:'
      ? (parsed.hostname ? `/${parsed.hostname}${parsed.pathname}` : parsed.pathname)
      : parsed.pathname.replace(/^\/--\//, '/')
    const target = `${path}${parsed.search}`
    return routeGate(target) === null ? null : target
  } catch { return null }
}

function routeGate(target: string): 'public' | 'auth' | 'welcome' | 'private' | null {
  const path = target.split(/[?#]/)[0].replace(/\/$/, '') || '/'
  if (/^\/join\/[^/]+$/.test(path) || path === '/') return 'public'
  if (path === '/sign-in' || path === '/(auth)/sign-in') return 'auth'
  if (path === '/welcome') return 'welcome'
  if (/^\/(?:\(tabs\)\/)?(?:today|path|profile)$/.test(path) || path === '/(tabs)') return 'private'
  if (/^\/(?:opt-in|settings|flag)$/.test(path)) return 'private'
  if (/^\/unit\/[^/]+$/.test(path)) return 'private'
  if (/^\/play\/(?:loading|quick\/[^/]+|[^/]+(?:\/done)?)$/.test(path)) return 'private'
  return null
}

export function canOpenTarget(target: string, state: GateState): boolean {
  const gate = routeGate(target)
  if (gate === 'public') return true
  if (state.status === 'loading') return false
  if (gate === 'auth') return state.status === 'signedOut'
  if (gate === 'welcome') return state.status === 'ready'
  return gate === 'private' && state.status === 'ready' && !state.needsDisclosure
}

export function homeTarget(state: GateState) {
  if (state.status === 'signedOut') return '/(auth)/sign-in' as const
  if (state.needsDisclosure) return '/welcome' as const
  return '/(tabs)/today' as const
}
