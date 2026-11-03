export function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="section">
      <div className="wrap">
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
      </div>
    </section>
  )
}
