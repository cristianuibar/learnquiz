export function Managers() {
  return (
    <section aria-labelledby="feature-Profile" className="section">
      <div className="wrap grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
        <div>
          <h2 id="feature-Profile" className="text-title-1">Progress managers can read</h2>
          <p className="mt-4 text-body-lg text-ink-muted">Role mastery against your benchmark, the onboarding day, and the critical steps to recheck. The employee sees the same page.</p>
        </div>
        <img
          className="mx-auto h-auto w-[360px] max-w-full rounded-md border border-border"
          src="/screens/Profile.png"
          width="360"
          height="740"
          loading="lazy"
          decoding="async"
          alt="Training progress for warehouse picker Jordan Reyes: 66% mastery against an 85% benchmark, day 16 of 30, with a weekly trend and progress by unit."
        />
      </div>
    </section>
  )
}
