import { createAuthClient } from 'better-auth/react'
import { adminClient, anonymousClient, organizationClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  plugins: [
    anonymousClient(),
    adminClient(),
    organizationClient({ schema: { invitation: { additionalFields: { jobRoleId: { type: 'string', required: true }, inviteeName: { type: 'string', required: true } } } } }),
  ],
})
