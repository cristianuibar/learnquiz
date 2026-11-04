import { createFileRoute } from '@tanstack/react-router'
import { LegalNotice, type LegalSection } from '../components/legal-notice'

const sections: LegalSection[] = [
  {
    id: 'age',
    heading: 'Who may use it',
    blocks: ['LearnQuiz is for adults at work and is not meant for anyone under 16.'],
  },
  {
    id: 'accounts',
    heading: 'Accounts',
    blocks: ['Your account is created by your employer or by you.'],
  },
  {
    id: 'use',
    heading: 'Acceptable use',
    blocks: [
      'Use the app only for your training at work. Do not upload documents you have no right to share, and do not try to break or misuse the app.',
    ],
  },
  {
    id: 'results',
    heading: 'Training results',
    blocks: ['Training results are a development aid. A person makes every decision.'],
  },
  {
    id: 'pilot',
    heading: 'During the pilot',
    blocks: ['The service is provided as is during the pilot.'],
  },
  {
    id: 'delete',
    heading: 'Deleting your account',
    blocks: ['To ask for your account to be deleted, write to hello@learnquiz.com.'],
  },
  {
    id: 'who',
    heading: 'Who is responsible',
    blocks: ['LearnQuiz is run by its founder as a sole proprietor, based in Timișoara, Romania. It is not yet a registered company.'],
  },
]

export const Route = createFileRoute('/terms')({
  head: () => ({ meta: [{ title: 'Terms — Learn Quiz' }] }),
  component: () => <LegalNotice id="terms" title="Terms" sections={sections} />,
})
