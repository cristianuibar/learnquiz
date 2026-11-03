import { androidApkUrl, learnOnYourOwnUrl, signUpUrl } from '../../site-config'

export function Close({ apkUrl = androidApkUrl }: { apkUrl?: string }) {
  return (
    <section className="close section" aria-labelledby="lqs-close">
      <div className="wrap">
        <div className="close-in">
          <h2 id="lqs-close" className="h-hero">Quiz it, until you learn it.</h2>
          <div className="close-actions" id="lqs-close-cta">
            <a className="btn btn-accent btn-lg" href={signUpUrl}>Create a company account</a>
            <a className="btn btn-ghost btn-lg" href={learnOnYourOwnUrl}>Learn on your own</a>
            {apkUrl ? <a className="btn btn-secondary btn-lg" href={apkUrl}>Get the Android app</a> : null}
          </div>
        </div>
      </div>
    </section>
  )
}
