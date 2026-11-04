import { createContext, useContext, type ReactNode } from 'react'
import { linkOptions } from '@tanstack/react-router'

// Which URL prefix the portal screens render under: `org` for partners, `staff` for the read-only staff portal.
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

// Link props for every portal screen, so screens never hardcode a URL prefix. `org` links live under /org/$slug;
// `staff` links live under /admin/companies/$slug/portal. Consumers can read `usePortal().base` when they need to branch.
export function usePortalLinks() {
  const { slug, base } = usePortal()
  if (base === 'staff') {
    const overview = linkOptions({ to: '/admin/companies/$slug/portal', params: { slug }, activeOptions: { exact: true } })
    return {
      overview,
      roles: linkOptions({ to: '/admin/companies/$slug/portal/roles', params: { slug } }),
      role: (roleId: string) => linkOptions({ to: '/admin/companies/$slug/portal/roles/$roleId', params: { slug, roleId } }),
      // Staff have no routes for these yet (a follow-on issue adds them), so they fall back to the staff overview.
      questions: (_filter: { role?: string; item?: string } = {}) => overview,
      people: overview,
      person: (_id: string) => overview,
      settings: overview,
    }
  }
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
