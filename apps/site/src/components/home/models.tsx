import { githubUrl } from '../../site-config'

export function Models() {
  return (
    <>
      <section aria-labelledby="models-title" className="section">
        <div className="wrap">
          <h2 id="models-title" className="text-title-1">Built on Meta models</h2>
          <p className="mt-4 text-body-lg text-ink-muted">Questions, grading of written answers and voice transcription run on Meta's models.</p>
        </div>
      </section>

      <section aria-labelledby="source-title" className="section">
        <div className="wrap">
          <h2 id="source-title" className="text-title-1">Open source</h2>
          <p className="mt-4 text-body-lg text-ink-muted">The code is public.</p>
          <a className="btn btn-secondary mt-4" href={githubUrl}>View the code</a>
        </div>
      </section>
    </>
  )
}
