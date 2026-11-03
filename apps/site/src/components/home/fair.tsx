import { Icon } from '../ui/icon'

const recorded = [
  ['Recorded', 'Answers, how sure you were, how long each took, and progress toward the benchmark.'],
  ['Who sees it', 'You, and your company’s Learn Quiz admins, such as your manager or training lead.'],
  ['What it’s for', 'Training and development: what to review next, and when you’ve reached the role’s benchmark.'],
] as const

const never = ['No camera, sensors or health data.', 'No personality scores.', 'No ranking against coworkers.'] as const

export function Fair() {
  return (
    <section className="section" aria-labelledby="lqs-fair">
      <div className="wrap">
        <h2 id="lqs-fair" className="h-section max-w-[760px]">What Learn Quiz records, and what it never does.</h2>
        <div className="fair-grid">
          <dl className="fair-dl">
            {recorded.map(([term, detail]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{detail}</dd>
              </div>
            ))}
          </dl>
          <div className="never">
            <h3 className="t-label muted">Never</h3>
            <ul className="stack gap-3">
              {never.map((item) => (
                <li key={item}>
                  <Icon name="ban" size={20} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="closer">No biometrics, no hidden tests. A person decides.</p>
      </div>
    </section>
  )
}
