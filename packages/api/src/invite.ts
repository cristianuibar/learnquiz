export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'canceled' | 'rejected'

// logoUrl is null until the invite logo route exists.
export type InviteView = {
  company: string
  email: string
  name: string
  status: InviteStatus
  otherAccount: boolean
  roleName: string | null
  accent: string | null
  logoUrl: string | null
}

// Headline for the invite page: "Train as a warehouse picker" or "Join Acme".
export function roleHeadline(roleName: string | null, company: string): string {
  const role = roleName?.trim()
  if (!role) return `Join ${company}`
  const first = role.split(/\s+/)[0] ?? ''
  const acronym = first.length > 1 && first === first.toUpperCase() && first !== first.toLowerCase()
  const text = acronym ? role : role.charAt(0).toLowerCase() + role.slice(1)
  const article = /^[aeiou]/i.test(role) ? 'an' : 'a'
  return `Train as ${article} ${text}`
}

// Possessive with the typographic apostrophe.
export function possessive(name: string): string {
  const n = name.trim()
  return /s$/i.test(n) ? `${n}’` : `${n}’s`
}

// First letters of the first two words, upper case.
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('')
}
