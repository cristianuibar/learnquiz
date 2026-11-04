import { createContext, useContext, type ReactNode } from 'react'
import { linkOptions } from '@tanstack/react-router'

// Which URL prefix the portal screens render under. Only `org` is routed today; staff read-only routes come later.
export type PortalBase = 'org' | 'staff'
type Portal = { slug: string; base: PortalBase; readOnly: boolean }

const PortalContext = createContext<Portal | null>(null)

export function PortalProvider({ children, ...portal }: Portal & { children: ReactNode }) {
  return <PortalContext.Provider value={portal}>{children}</PortalContext.Provider>
}

export function usePortal() {
  const portal = useContext(PortalContext)
  if (!portal) throw new Error('usePortal needs a PortalProvider')
  return portal
}

// Link props for every portal screen, so screens never hardcode /org/$slug.
export function usePortalLinks() {
  const { slug } = usePortal()
  return {
    overview: linkOptions({ to: '/org/$slug', params: { slug }, activeOptions: { exact: true } }),
    roles: linkOptions({ to: '/org/$slug/roles', params: { slug } }),
    role: (roleId: string) => linkOptions({ to: '/org/$slug/roles/$roleId', params: { slug, roleId } }),
    questions: ({ role, item }: { role?: string; item?: string } = {}) => linkOptions({ to: '/org/$slug/questions', params: { slug }, search: { role, item }, activeOptions: { includeSearch: false } }),
    people: linkOptions({ to: '/org/$slug/people', params: { slug } }),
    person: (id: string) => linkOptions({ to: '/org/$slug/people/$id', params: { slug, id } }),
    settings: linkOptions({ to: '/org/$slug/settings', params: { slug } }),
  }
}
