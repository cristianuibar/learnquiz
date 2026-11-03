export function AnswerMoment() {
  return (
    <>
      <section id="try" aria-labelledby="feature-Reveal" className="section">
        <div className="wrap grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="lg:order-2">
            <h2 id="feature-Reveal" className="text-title-1">Answers from your documents</h2>
            <p className="mt-4 text-body-lg text-ink-muted">Every answer quotes the SOP passage it came from. When there is no source, it says so.</p>
          </div>
          <img
            className="mx-auto h-auto w-[360px] max-w-full rounded-md border border-border"
            src="/screens/Reveal.png"
            width="360"
            height="740"
            loading="lazy"
            decoding="async"
            alt="A quiz answer reveal showing the correct response to a torn pallet wrap: photograph the damage and note it on the delivery receipt."
          />
        </div>
      </section>

      <section aria-labelledby="feature-QChoice" className="section">
        <div className="wrap grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="lg:order-2">
            <h2 id="feature-QChoice" className="text-title-1">Confidence counts</h2>
            <p className="mt-4 text-body-lg text-ink-muted">Learners say how sure they are. A confident mistake on a critical step comes back first.</p>
          </div>
          <img
            className="mx-auto h-auto w-[360px] max-w-full rounded-md border border-border"
            src="/screens/QChoice.png"
            width="360"
            height="740"
            loading="lazy"
            decoding="async"
            alt="A multiple-choice procedure question with Sure, Unsure and Guessing confidence choices before checking the answer."
          />
        </div>
      </section>
    </>
  )
}
