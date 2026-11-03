import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Learn Quiz — Train every new hire on your own procedures.' },
      { name: 'description', content: "Upload your SOPs. Each employee gets five-minute quiz sessions and one question during the shift, in your company's words, until they know the job." },
    ],
  }),
  component: MarketingPage,
})

const features = [
  {
    title: 'Answers from your documents',
    text: 'Every answer quotes the SOP passage it came from. When there is no source, it says so.',
    screen: 'Reveal',
    alt: 'A quiz answer reveal showing the correct response to a torn pallet wrap: photograph the damage and note it on the delivery receipt.',
  },
  {
    title: 'One question during the shift',
    text: 'Up to 6 a day while someone is onboarding, then 3, only in working hours. Skip any; nothing is lost.',
    screen: 'PushLock',
    alt: 'An Android lock-screen notification from Learn Quiz asking what to do first when a scanner double-beeps on a pick.',
  },
  {
    title: 'Confidence counts',
    text: 'Learners say how sure they are. A confident mistake on a critical step comes back first.',
    screen: 'QChoice',
    alt: 'A multiple-choice procedure question with Sure, Unsure and Guessing confidence choices before checking the answer.',
  },
  {
    title: 'Progress managers can read',
    text: 'Role mastery against your benchmark, the onboarding day, and the critical steps to recheck. The employee sees the same page.',
    screen: 'Profile',
    alt: 'Training progress for warehouse picker Jordan Reyes: 66% mastery against an 85% benchmark, day 16 of 30, with a weekly trend and progress by unit.',
  },
]

function MarketingPage() {
  return (
    <div className="site-container">
      <a href="#main" className="site-action sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-10 focus:bg-surface-card">
        Skip to content
      </a>
      <header className="flex items-center justify-between gap-4 border-b border-border py-6">
        <a href="/" className="site-action gap-2 px-0 text-title-2 text-ink">
          <svg viewBox="0 0 64 64" width="32" height="32" aria-hidden="true" focusable="false">
            <defs>
              <clipPath id="logo-ring">
                <path clipRule="evenodd" d="M0 0H64V64H0ZM61 48a13 13 0 1 0-26 0 13 13 0 1 0 26 0Z" />
              </clipPath>
            </defs>
            <circle cx="32" cy="32" r="19" fill="none" className="stroke-brand" strokeWidth="14" clipPath="url(#logo-ring)" />
            <circle cx="48" cy="48" r="9" className="fill-accent" />
          </svg>
          Learn Quiz
        </a>
        <nav aria-label="Account">
          <a className="site-action" href="https://app.learnquiz.com/sign-in">Sign in</a>
        </nav>
      </header>

      <main id="main" tabIndex={-1}>
        <section aria-labelledby="hero-title" className="grid items-center gap-12 py-12 lg:grid-cols-2">
          <div>
            <h1 id="hero-title" className="text-title-1 md:text-display">Train every new hire on your own procedures.</h1>
            <p className="mt-6 text-body-lg text-ink-muted">
              Upload your SOPs. Each employee gets five-minute quiz sessions and one question during the shift, in your company's words, until they know the job.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a className="site-action bg-accent text-on-accent hover:text-on-accent" href="https://app.learnquiz.com/sign-in?mode=up&redirect=%2Forg%2Fnew">
                Create a company account
              </a>
              <a className="site-action border border-border-strong" href="https://app.learnquiz.com/sign-in">Sign in</a>
            </div>
          </div>
          <img
            className="mx-auto h-auto w-[360px] max-w-full rounded-md border border-border"
            src="/screens/Today.png"
            width="360"
            height="740"
            fetchPriority="high"
            alt="Learn Quiz Today screen for Northwind Logistics with a five-minute session, daily reviews, and warehouse picker mastery at 66% of an 85% benchmark."
          />
        </section>

        <section aria-labelledby="how-title" className="border-t border-border py-12">
          <h2 id="how-title" className="text-title-1">How it works</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              'Upload the documents for a role.',
              'Employees train five minutes a day.',
              'See who is ready and what to recheck.',
            ].map((step) => (
              <li key={step} className="rounded-md border border-border bg-surface-card p-6">
                <h3 className="text-title-2">{step}</h3>
              </li>
            ))}
          </ol>
        </section>

        {features.map(({ title, text, screen, alt }, index) => (
          <section key={screen} aria-labelledby={`feature-${screen}`} className="grid items-center gap-8 border-t border-border py-12 lg:grid-cols-2 lg:gap-12">
            <div className={index % 2 === 0 ? 'lg:order-2' : undefined}>
              <h2 id={`feature-${screen}`} className="text-title-1">{title}</h2>
              <p className="mt-4 text-body-lg text-ink-muted">{text}</p>
            </div>
            <img
              className="mx-auto h-auto w-[360px] max-w-full rounded-md border border-border"
              src={`/screens/${screen}.png`}
              width="360"
              height="740"
              loading="lazy"
              decoding="async"
              alt={alt}
            />
          </section>
        ))}

        <section aria-labelledby="privacy-title" className="border-t border-border py-12">
          <h2 id="privacy-title" className="text-title-1">Privacy and fairness</h2>
          <p className="mt-4 text-body-lg text-ink-muted">
            We record answers, confidence, time and progress. Never camera, location, sensors or health data. A person makes every decision, and employees can flag a result.
          </p>
          <a className="site-action mt-4 px-0 underline" href="/privacy">Read the privacy notice</a>
        </section>

        <section aria-labelledby="models-title" className="border-t border-border py-12">
          <h2 id="models-title" className="text-title-1">Built on Meta models</h2>
          <p className="mt-4 text-body-lg text-ink-muted">Questions, grading of written answers and voice transcription run on Meta's models.</p>
        </section>

        <section aria-labelledby="source-title" className="border-t border-border py-12">
          <h2 id="source-title" className="text-title-1">Open source</h2>
          <p className="mt-4 text-body-lg text-ink-muted">The code is public.</p>
          <a className="site-action mt-4 border border-border-strong" href="https://github.com/cristianuibar/learnquiz">View the code</a>
        </section>

        <section aria-labelledby="close-title" className="border-t border-border py-12">
          <h2 id="close-title" className="text-title-1 md:text-display">Quiz it, until you learn it.</h2>
          <div className="mt-8 flex flex-wrap gap-4">
            <a className="site-action border border-border-strong" href="https://app.learnquiz.com/sign-in">Sign in</a>
            <a className="site-action border border-border-strong" href="https://app.learnquiz.com/start">Learn on your own</a>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-6">
        <nav aria-label="Site" className="flex flex-wrap gap-6">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="https://github.com/cristianuibar/learnquiz">GitHub</a>
        </nav>
      </footer>
    </div>
  )
}
