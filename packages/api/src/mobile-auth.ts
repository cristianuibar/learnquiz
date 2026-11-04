/** The only native OAuth return target; bearer tokens never travel in this URL. */
export const MOBILE_AUTH_REDIRECT = 'learnquiz://sign-in'
export type AuthCapabilities = { facebook: boolean }
export type FacebookStart = { url: string; state: string; verifier: string; expiresAt: number }
export type FacebookExchange = { token: string; user: { id: string } }
