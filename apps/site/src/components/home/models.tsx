import { githubUrl } from '../../site-config'
import { Icon } from '../ui/icon'

const models = [
  ['Muse Spark', 'Writes the curriculum and questions from your SOPs, checks each one against the source, and grades written answers.'],
  ['Muse Wonder', 'Orders each session, mixing due reviews with new concepts.'],
  ['Muse Image', 'Draws diagrams of procedures.'],
  ['Muse Voice', 'Transcribes spoken answers into a transcript the learner can edit before checking.'],
] as const

const hosting = [
  ['Hosted', 'Run by us at learnquiz.com.'],
  ['Local', 'On your own server, with a Meta open-weight model.'],
] as const

export function Models() {
  return (
    <section className="section" aria-labelledby="lqs-models">
      <div className="wrap">
        <h2 id="lqs-models" className="h-section max-w-[760px]">Built on Meta models. Open source.</h2>
        <div className="models-grid">
          <dl className="models">
            {models.map(([name, job]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{job}</dd>
              </div>
            ))}
          </dl>
          <div className="oss">
            <h3 className="t-title2">MIT licensed</h3>
            <dl className="oss-list">
              {hosting.map(([term, detail]) => (
                <div key={term}>
                  <dt className="t-label">{term}</dt>
                  <dd>{detail}</dd>
                </div>
              ))}
            </dl>
            <a className="btn btn-secondary" href={githubUrl}>
              View on GitHub
              <Icon name="arrow-up-right" size={18} />
            </a>
            <p className="hack">Built for the Meta Global AI Developer Hackathon 2026.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
