import { createFileRoute } from '@tanstack/react-router'
import { SiteFooter } from '../components/site-footer'
import { SiteHeader } from '../components/site-header'
import { AnswerMoment } from '../components/home/answer-moment'
import { Close } from '../components/home/close'
import { Fair } from '../components/home/fair'
import { Hero } from '../components/home/hero'
import { HowItWorks } from '../components/home/how-it-works'
import { Managers } from '../components/home/managers'
import { Models } from '../components/home/models'
import { Problem } from '../components/home/problem'
import { PushQuestions } from '../components/home/push-questions'
import { Science } from '../components/home/science'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Learn Quiz: onboarding from your own SOPs' },
      { name: 'description', content: 'Upload a role’s SOPs. New hires practice them on their phone in five-minute sessions until they reach your benchmark. Every explanation quotes your document.' },
    ],
  }),
  component: MarketingPage,
})

function MarketingPage() {
  return (
    <div className="site">
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        <Hero />
        <Problem />
        <HowItWorks />
        <AnswerMoment />
        <PushQuestions />
        <Managers />
        <Fair />
        <Science />
        <Models />
        <Close />
      </main>
      <SiteFooter />
    </div>
  )
}
