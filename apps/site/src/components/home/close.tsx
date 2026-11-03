import { learnOnYourOwnUrl, signInUrl } from '../../site-config'

export function Close() {
  return (
    <section aria-labelledby="close-title" className="section">
      <div className="wrap">
        <h2 id="close-title" className="text-title-1 md:text-display">Quiz it, until you learn it.</h2>
        <div id="lqs-close-cta" className="mt-8 flex flex-wrap gap-4">
          <a className="btn btn-secondary" href={signInUrl}>Sign in</a>
          <a className="btn btn-secondary" href={learnOnYourOwnUrl}>Learn on your own</a>
        </div>
      </div>
    </section>
  )
}
