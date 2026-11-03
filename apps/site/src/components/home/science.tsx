import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from '../ui/icon'

export function Science() {
  const descriptionId = useId()
  const figureRef = useRef<HTMLElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const replayTimer = useRef<number | undefined>(undefined)
  const motionAllowed = useRef(false)
  const [motionOk, setMotionOk] = useState(false)
  const [curve, setCurve] = useState<'static' | 'armed' | 'play'>('static')

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    let disposed = false

    function stopAnimation() {
      observerRef.current?.disconnect()
      observerRef.current = null
      window.clearTimeout(replayTimer.current)
      replayTimer.current = undefined
    }

    function updateMotion() {
      motionAllowed.current = !preference.matches
      setMotionOk(motionAllowed.current)
      stopAnimation()
      setCurve('static')
    }

    updateMotion()
    const figure = figureRef.current
    // Keep the prerender and hydration static; only arm an unseen chart after mount.
    if (
      motionAllowed.current &&
      figure &&
      figure.getBoundingClientRect().top > window.innerHeight &&
      typeof IntersectionObserver !== 'undefined'
    ) {
      setCurve('armed')
      const observer = new IntersectionObserver((entries) => {
        if (disposed || observerRef.current !== observer || !motionAllowed.current) return
        if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5)) {
          setCurve('play')
          observer.disconnect()
          observerRef.current = null
        }
      }, { threshold: 0.5 })
      observerRef.current = observer
      observer.observe(figure)
    }

    preference.addEventListener('change', updateMotion)
    return () => {
      disposed = true
      motionAllowed.current = false
      stopAnimation()
      preference.removeEventListener('change', updateMotion)
    }
  }, [])

  function replay() {
    if (!motionAllowed.current) return
    observerRef.current?.disconnect()
    observerRef.current = null
    window.clearTimeout(replayTimer.current)
    setCurve('armed')
    replayTimer.current = window.setTimeout(() => {
      replayTimer.current = undefined
      if (motionAllowed.current) setCurve('play')
    }, 60)
  }

  return (
    <section className="section" aria-labelledby="lqs-sci">
      <div className="wrap">
        <h2 id="lqs-sci" className="h-section max-w-[760px]">Built on how memory works.</h2>
        <div className="sci-grid">
          <figure ref={figureRef} className={`curve-fig${curve === 'static' ? '' : ` curve-${curve}`}`}>
            <figcaption className="t-title2">One procedure, two ways to learn it (illustration)</figcaption>
            <svg
              className="curve-svg"
              viewBox="0 -22 360 248"
              role="img"
              aria-label="Illustrative chart. Read once: recall falls steeply and is nearly gone by day 7. Reviewed on days 1, 3 and 7: each review brings recall back to the top, and each drop afterwards is shallower, so recall stays high at day 14."
              aria-describedby={descriptionId}
            >
              <desc id={descriptionId}>
                The horizontal axis shows days 0, 1, 3, 7 and 14. The vertical axis shows recall.
                The solid line and dots show reviews on days 1, 3 and 7; the dashed line shows reading once.
                This is an illustration, not measured data.
              </desc>
              <line x1="32" y1="20" x2="352" y2="20" stroke="var(--border)" strokeWidth="1" />
              <line x1="32" y1="190" x2="352" y2="190" stroke="var(--border-strong)" strokeWidth="1" />
              <text x="0" y="-6">Recall</text>
              <text x="32" y="214" textAnchor="middle">0</text>
              <text x="54.9" y="214" textAnchor="middle">1</text>
              <text x="100.6" y="214" textAnchor="middle">3</text>
              <text x="192" y="214" textAnchor="middle">7</text>
              <text x="352" y="214" textAnchor="end">14 days</text>
              <polyline
                points="32,20 43.4,51 54.9,76 66.3,97 77.7,114 100.6,139 123.4,156 146.3,167 169.1,175 192,180 214.9,183 260.6,187 306.3,189 352,189"
                fill="none" stroke="var(--ink-muted)" strokeWidth="2" strokeDasharray="6 6" strokeLinecap="round" strokeLinejoin="round"
              />
              <polyline
                className="curve-review"
                points="32,20 43.4,51 54.9,76 54.9,20 66.3,34 77.7,46 89.1,58 100.6,68 100.6,20 123.4,31 146.3,41 169.1,51 192,60 192,20 214.9,24 260.6,32 306.3,40 352,47"
                fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              />
              <circle className="curve-dot" cx="54.9" cy="20" r="5" fill="var(--brand)" />
              <circle className="curve-dot" cx="100.6" cy="20" r="5" fill="var(--brand)" />
              <circle className="curve-dot" cx="192" cy="20" r="5" fill="var(--brand)" />
            </svg>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="curve-key" aria-hidden="true">
                <span>
                  <svg width="24" height="8" viewBox="0 0 24 8"><line x1="0" y1="4" x2="24" y2="4" stroke="var(--brand)" strokeWidth="2.5" /></svg>
                  Reviewed on days 1, 3 and 7
                </span>
                <span>
                  <svg width="24" height="8" viewBox="0 0 24 8"><line x1="0" y1="4" x2="24" y2="4" stroke="var(--ink-muted)" strokeWidth="2" strokeDasharray="6 6" /></svg>
                  Read once
                </span>
              </div>
              {motionOk ? <button className="link-btn" type="button" onClick={replay}><Icon name="replay" size={18} />Replay</button> : null}
            </div>
          </figure>
          <ul className="claims">
            <li className="claim">
              <h3 className="t-title2">Trying to recall beats rereading.</h3>
              <p className="t-body-lg">Pulling an answer from memory makes it last longer than reading the page again.</p>
              <cite className="cite">Roediger &amp; Karpicke, 2006, <i>Psychological Science</i> · Dunlosky et al., 2013, <i>Psychological Science in the Public Interest</i></cite>
            </li>
            <li className="claim">
              <h3 className="t-title2">Spaced reviews make knowledge last.</h3>
              <p className="t-body-lg">Reviews spread over days hold knowledge longer than one long session. FSRS, an open-source scheduler, picks the day for each review.</p>
              <cite className="cite">Cepeda, Pashler, Vul, Wixted &amp; Rohrer, 2006, <i>Psychological Bulletin</i></cite>
            </li>
            <li className="claim">
              <h3 className="t-title2">Knowing why makes practice count.</h3>
              <p className="t-body-lg">Feedback that explains the right answer corrects mistakes and carries over to new situations.</p>
              <cite className="cite">Butler, Karpicke &amp; Roediger, 2008, <i>JEP: Learning, Memory, and Cognition</i> · Butler, Godbole &amp; Marsh, 2013, <i>Journal of Educational Psychology</i></cite>
            </li>
            <li className="claim">
              <h3 className="t-title2">Confidence shows what is shaky.</h3>
              <p className="t-body-lg">Asking how sure you are separates lucky guesses from real knowledge. Mistakes made with confidence are the ones feedback corrects best.</p>
              <cite className="cite">Butterfield &amp; Metcalfe, 2001, <i>JEP: Learning, Memory, and Cognition</i> · Metcalfe, 2017, <i>Annual Review of Psychology</i></cite>
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}
