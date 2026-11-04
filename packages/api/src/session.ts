// GET /api/v1/session and GET /api/v1/branding, shared by the server and the Android app.
export type SessionUser = { id: string; name: string; isAnonymous: boolean; role?: string | null }
// logoUrl is relative to the app host (`/api/org/<id>/logo?v=<key>`); null when the company has no logo.
export type Branding = { name: string; logoUrl: string | null; accent: string | null }
export type SessionResponse = {
  user: SessionUser | null
  facebookEnabled: boolean
  needsDisclosure: boolean
  adminCompanies: { name: string; slug: string }[]
}
