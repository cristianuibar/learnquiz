import { createFileRoute } from '@tanstack/react-router'
import { LegalNotice, type LegalSection } from '../components/legal-notice'

const sections: LegalSection[] = [
  {
    id: 'who',
    heading: 'Who is responsible',
    blocks: ['LearnQuiz is run by its founder as a sole proprietor, based in Timișoara, Romania. It is not yet a registered company.'],
  },
  {
    id: 'records',
    heading: 'What the app records',
    blocks: [
      'Your answers, how sure you were, how long each answer took, and your progress.',
      'What you type in a reflection or a report note is stored with the attempt.',
    ],
  },
  { id: 'sees', heading: 'Who sees it', blocks: ["You and your company's admins."] },
  { id: 'for', heading: 'What it is for', blocks: ['Your training and development.'] },
  {
    id: 'never',
    heading: 'What is never recorded',
    blocks: ['The app does not read your camera, your sensors or your health data. Voice recordings are not stored.'],
  },
  {
    id: 'processors',
    heading: 'Processors',
    blocks: [
      'Cloudflare hosts the app. Meta models write questions, grade written answers and transcribe voice answers when you choose to use voice.',
    ],
  },
  {
    id: 'age',
    heading: 'Who may use it',
    blocks: ['LearnQuiz is for adults at work and is not meant for anyone under 16.'],
  },
  {
    id: 'contact',
    heading: 'Contact',
    blocks: [
      'Questions about this notice go to hello@learnquiz.com.',
      {
        id: 'delete',
        text: "To delete your account and everything LearnQuiz recorded about you, email hello@learnquiz.com from your account's address; we delete it within 30 days.",
      },
    ],
  },
]

export const Route = createFileRoute('/privacy')({
  head: () => ({ meta: [{ title: 'Privacy — Learn Quiz' }] }),
  component: () => <LegalNotice id="privacy" title="Privacy" sections={sections} />,
})
