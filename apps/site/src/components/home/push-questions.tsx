export function PushQuestions() {
  return (
    <section aria-labelledby="feature-PushLock" className="section">
      <div className="wrap grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
        <div>
          <h2 id="feature-PushLock" className="text-title-1">One question during the shift</h2>
          <p className="mt-4 text-body-lg text-ink-muted">Up to 6 a day while someone is onboarding, then 3, only in working hours. Skip any; nothing is lost.</p>
        </div>
        <img
          className="mx-auto h-auto w-[360px] max-w-full rounded-md border border-border"
          src="/screens/PushLock.png"
          width="360"
          height="740"
          loading="lazy"
          decoding="async"
          alt="An Android lock-screen notification from Learn Quiz asking what to do first when a scanner double-beeps on a pick."
        />
      </div>
    </section>
  )
}
