import { createFileRoute } from '@tanstack/react-router'
import { LegalNotice } from '../components/legal-notice'

export const Route = createFileRoute('/terms')({
  head: () => ({ meta: [{ title: 'Terms — Learn Quiz' }] }),
  component: () => <LegalNotice title="Terms" />,
})
