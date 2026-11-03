import { Icon } from '../ui/icon'

export function HowItWorks() {
  return (
    <section className="section" aria-labelledby="lqs-how">
      <div className="wrap">
        <div className="how-grid">
          <div className="stack gap-8">
            <h2 id="lqs-how" className="h-section">Your SOPs become the training.</h2>
            <ol className="steps" role="list">
              <li className="step">
                <span className="step-n" aria-hidden="true">1</span>
                <div className="stack gap-1">
                  <h3 className="t-title2">Upload the role’s SOPs</h3>
                  <p className="t-body muted">A PDF or pasted text, one role at a time.</p>
                </div>
              </li>
              <li className="step">
                <span className="step-n" aria-hidden="true">2</span>
                <div className="stack gap-1">
                  <h3 className="t-title2">Learn Quiz builds the curriculum and questions</h3>
                  <p className="t-body muted">Units, concepts and questions, each explanation quoting your document. Safety, money and compliance steps are marked critical.</p>
                </div>
              </li>
              <li className="step">
                <span className="step-n" aria-hidden="true">3</span>
                <div className="stack gap-1">
                  <h3 className="t-title2">New hires practice until they reach the benchmark</h3>
                  <p className="t-body muted">Invite them with a link or QR code. A placement quiz of 8 to 12 answers skips what they already know. Five-minute sessions cover the rest.</p>
                </div>
              </li>
            </ol>
          </div>

          <figure className="stack gap-3">
            <div className="how-flow">
              <div className="doc">
                <div className="doc-head">
                  <Icon name="doc" size={20} className="text-ink-muted" />
                  <span className="t-label flex-1">Warehouse picker SOPs.pdf</span>
                  <span className="t-caption muted">Page 9</span>
                </div>
                <div className="doc-line w-[92%]" aria-hidden="true"></div>
                <div className="doc-line w-[70%]" aria-hidden="true"></div>
                <div className="doc-mark">
                  <p className="t-caption muted">§3.4</p>
                  <p className="t-body"><strong className="font-bold">Critical: resolve a scan mismatch.</strong> If the scanner reports the wrong location or item, stop the pick and notify the shift lead. Do not override the warning, scan a nearby item’s label, or type the expected code to force a match.</p>
                </div>
                <div className="doc-line w-[84%]" aria-hidden="true"></div>
                <div className="doc-line w-[58%]" aria-hidden="true"></div>
              </div>

              <div className="arrow">
                <Icon name="arrow-right" size={24} />
                <span className="sr-only">becomes</span>
              </div>

              <div className="gen">
                <div className="crumbs">
                  <span className="t-caption muted">Scanning</span>
                  <Icon name="chevron-right" size={16} className="text-ink-muted" />
                  <span className="t-caption">Resolve a scan mismatch</span>
                  <span className="chip chip-critical">
                    <Icon name="critical" size={16} />
                    Critical
                  </span>
                </div>
                <p className="t-title2 text-[17px] leading-6">Your scanner says the item doesn’t match the pick. What do you do first?</p>
                <ul className="opt-list gap-2">
                  <li className="opt"><span className="radio" aria-hidden="true"></span><span className="opt-text">Scan the item next to it</span></li>
                  <li className="opt"><span className="radio" aria-hidden="true"></span><span className="opt-text">Stop the pick and tell the shift lead</span></li>
                  <li className="opt"><span className="radio" aria-hidden="true"></span><span className="opt-text">Type the expected code</span></li>
                  <li className="opt"><span className="radio" aria-hidden="true"></span><span className="opt-text">Override and continue</span></li>
                </ul>
                <p className="quote-src">
                  <Icon name="doc" size={16} />
                  The explanation quotes Warehouse picker SOPs v3 · §3.4
                </p>
              </div>
            </div>
          </figure>
        </div>
      </div>
    </section>
  )
}
