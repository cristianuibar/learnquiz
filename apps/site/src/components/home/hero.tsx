import { signInUrl, signUpUrl } from '../../site-config'

export function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title" className="hero">
      <div className="wrap grid items-center gap-12 lg:grid-cols-2">
        <div>
          <h1 id="hero-title" className="text-title-1 md:text-display">Train every new hire on your own procedures.</h1>
          <p className="mt-6 text-body-lg text-ink-muted">
            Upload your SOPs. Each employee gets five-minute quiz sessions and one question during the shift, in your company's words, until they know the job.
          </p>
          <div id="lqs-hero-cta" className="mt-8 flex flex-wrap items-center gap-4">
            <a className="btn btn-accent" href={signUpUrl}>
              Create a company account
            </a>
            <a className="btn btn-secondary" href={signInUrl}>Sign in</a>
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
      </div>
    </section>
  )
}
