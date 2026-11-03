import { createFileRoute } from '@tanstack/react-router'
import { LegalNotice } from '../components/legal-notice'

export const Route = createFileRoute('/privacy')({
  head: () => ({ meta: [{ title: 'Privacy — Learn Quiz' }] }),
  component: () => <LegalNotice title="Privacy" />,
})
