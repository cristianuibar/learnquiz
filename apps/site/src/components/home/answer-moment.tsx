import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Icon } from '../ui/icon'
import { PhoneFrame } from '../ui/phone-frame'

type AnswerId = 'a' | 'b' | 'c' | 'd'
type Confidence = 'sure' | 'unsure' | 'guessing'
type Outcome = 'cs' | 'cu' | 'nq' | 'sw'

const QUESTION = 'Your scanner says the item doesn’t match the pick. What do you do first?'
const CORRECT_TEXT = 'Stop the pick and tell the shift lead'

const ANSWERS: { id: AnswerId; text: string; why?: string; felt?: string }[] = [
  {
    id: 'a',
    text: 'Scan the item next to it',
    why: 'A nearby label makes the scanner agree, but the pick is now recorded from the wrong slot.',
    felt: 'The item next to it looks the same, so a match feels like a fix.',
  },
  { id: 'b', text: CORRECT_TEXT },
  {
    id: 'c',
    text: 'Type the expected code',
    why: 'Typing the code forces a match the scanner never made. The wrong item can still ship.',
    felt: 'You know which item the pick wants, so typing it feels faster than waiting.',
  },
  {
    id: 'd',
    text: 'Override and continue',
    why: 'The warning is the check. Override it and the mistake travels to the customer.',
    felt: 'Scanners misread sometimes, so the warning can feel like noise.',
  },
]
const CORRECT_ID: AnswerId = 'b'

const CONFIDENCES: { id: Confidence; label: string }[] = [
  { id: 'sure', label: 'Sure' },
  { id: 'unsure', label: 'Unsure' },
  { id: 'guessing', label: 'Guessing' },
]

const OUTCOMES: { key: Outcome; title: string; desc: string; sel: AnswerId; conf: Confidence }[] = [
  { key: 'cs', title: 'Correct and sure', desc: 'A short confirmation. The reason is one tap away.', sel: 'b', conf: 'sure' },
  { key: 'cu', title: 'Correct, unsure', desc: 'The explanation and the quote from your SOP, without asking.', sel: 'b', conf: 'unsure' },
  { key: 'nq', title: 'Not quite', desc: 'The right answer next to yours, why, and the source.', sel: 'a', conf: 'guessing' },
  { key: 'sw', title: 'Sure and wrong', desc: 'All of that, plus why it felt right. It comes back first next session.', sel: 'c', conf: 'sure' },
]

const BAND_SR: Record<Outcome, string> = {
  cs: ', and you were sure.',
  cu: ', but you weren’t sure, so here is why.',
  sw: ', and you were sure. This is a critical step.',
  nq: '.',
}

const STEP: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }

function outcomeOf(sel: AnswerId | null, conf: Confidence | null, revealed: boolean): Outcome | null {
  if (!revealed || !sel || !conf) return null
  const correct = sel === CORRECT_ID
  const sure = conf === 'sure'
  if (correct) return sure ? 'cs' : 'cu'
  return sure ? 'sw' : 'nq'
}

function SourceQuote() {
  return (
    <figure className="quote">
      <blockquote className="quote-text">
        “If the scanner reports the wrong location or item, stop the pick and notify the shift lead. Do not override the
        warning, scan a nearby item’s label, or type the expected code to force a match.”
      </blockquote>
      <figcaption className="quote-src">
        <Icon name="doc" size={16} />
        Warehouse picker SOPs v3 · §3.4
      </figcaption>
    </figure>
  )
}

/** One radiogroup with a roving tabindex: a single Tab stop, arrows move focus and select. */
function useRadioGroup<T extends string>(ids: readonly T[], current: T | null, select: (id: T) => void) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  return (id: T, index: number) => ({
    ref: (el: HTMLButtonElement | null) => {
      refs.current[index] = el
    },
    type: 'button' as const,
    role: 'radio',
    'aria-checked': current === id,
    tabIndex: (current ? current === id : index === 0) ? 0 : -1,
    onClick: () => select(id),
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        select(id)
        return
      }
      const step = STEP[e.key]
      if (!step) return
      e.preventDefault()
      const next = (index + step + ids.length) % ids.length
      refs.current[next]?.focus()
      select(ids[next])
    },
  })
}

const ANSWER_IDS = ANSWERS.map((a) => a.id)
const CONFIDENCE_IDS = CONFIDENCES.map((c) => c.id)

export function AnswerMoment() {
  const [sel, setSel] = useState<AnswerId | null>(null)
  const [conf, setConf] = useState<Confidence | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [whyOpen, setWhyOpen] = useState(false)

  const resultRef = useRef<HTMLHeadingElement>(null)
  const firstAnswerRef = useRef<HTMLButtonElement | null>(null)
  const shownKey = useRef('')
  const returnFocus = useRef(false)

  const outcome = outcomeOf(sel, conf, revealed)
  const chosen = ANSWERS.find((a) => a.id === sel) ?? null
  const isRight = outcome === 'cs' || outcome === 'cu'
  const isMiss = outcome === 'nq' || outcome === 'sw'

  // Every new result moves focus to the result heading; "Try another answer" returns focus to the first answer.
  useEffect(() => {
    const key = revealed ? `${sel}/${conf}` : ''
    const prev = shownKey.current
    shownKey.current = key
    if (key && key !== prev) {
      const heading = resultRef.current
      heading?.focus({ preventScroll: true })
      // Center the whole band so the sheet's 32px rise cannot tuck its label or XP under the sticky header.
      heading?.closest('.sheet-band')?.scrollIntoView?.({ block: 'center' })
    }
    if (prev && !key && returnFocus.current) {
      returnFocus.current = false
      firstAnswerRef.current?.focus()
    }
  }, [revealed, sel, conf])

  const answerProps = useRadioGroup(ANSWER_IDS, sel, setSel)
  const confProps = useRadioGroup(CONFIDENCE_IDS, conf, setConf)

  const show = (next: { sel: AnswerId; conf: Confidence }) => {
    setSel(next.sel)
    setConf(next.conf)
    setRevealed(true)
    setWhyOpen(false)
  }
  const reset = () => {
    setSel(null)
    setConf(null)
    setRevealed(false)
    setWhyOpen(false)
  }

  let body: ReactNode = null
  if (outcome) {
    const showWhy = outcome === 'cu' || (outcome === 'cs' && whyOpen)
    body = (
      <div className="sheet-body" tabIndex={0} role="region" aria-label="Answer details">
        {isRight ? <p className="t-body-lg">{CORRECT_TEXT}.</p> : null}
        {outcome === 'cs' ? (
          <button
            className="link-btn"
            type="button"
            aria-expanded={whyOpen}
            onClick={() => setWhyOpen((open) => !open)}
            style={{ alignSelf: 'flex-start', margin: '-12px 0 0 -8px' }}
          >
            Why
            <svg
              viewBox="0 0 24 24"
              width={20}
              height={20}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{
                transform: whyOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform var(--duration-fast) var(--ease-out)',
              }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        ) : null}
        {showWhy ? (
          <>
            <p className="t-body">
              The mismatch warning is the check. Stopping keeps the wrong item off the order, and the shift lead sorts out
              the slot.
            </p>
            <SourceQuote />
          </>
        ) : null}
        {isMiss ? (
          <>
            <div className="pair">
              <span className="pair-mark ic-correct" aria-hidden="true">
                <Icon name="check" />
              </span>
              <div className="stack" style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <p className="t-caption muted">The answer</p>
                <p className="t-body-lg">{CORRECT_TEXT}</p>
              </div>
            </div>
            <div className="pair">
              <span className="pair-mark ic-wrong" aria-hidden="true">
                <Icon name="close" />
              </span>
              <div className="stack" style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <p className="t-caption muted">You chose</p>
                <p className="t-body-lg">{chosen?.text}</p>
                <p className="t-body" style={{ marginTop: 4 }}>
                  {chosen?.why}
                </p>
              </div>
            </div>
          </>
        ) : null}
        {outcome === 'sw' ? (
          <>
            <p className="critical-row">
              <Icon name="critical" />
              <span>
                <strong style={{ fontWeight: 700 }}>You were sure, on a critical step.</strong> It comes back first next
                session.
              </span>
            </p>
            <div className="stack" style={{ gap: 4 }}>
              <h4 className="t-label">Why it felt right</h4>
              <p className="t-body">{chosen?.felt}</p>
            </div>
            <div className="stack" style={{ gap: 4 }}>
              <h4 className="t-label">What actually matters</h4>
              <p className="t-body">A mismatch means stop. The shift lead checks the slot before anything moves.</p>
            </div>
          </>
        ) : null}
        {isMiss ? <SourceQuote /> : null}
        {outcome === 'nq' ? (
          <p className="t-body muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="replay" />
            This comes back later this session.
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <section className="section section-band" aria-labelledby="lqs-answer" id="try">
      <div className="wrap">
        <div className="answer-grid">
          <div className="answer-intro">
            <h2 id="lqs-answer" className="h-section">
              Being right and being sure are different things.
            </h2>
            <p className="lead">Every answer comes with how sure you were. What you see next depends on both.</p>
          </div>

          <div className="demo-phone">
            <PhoneFrame>
              <div className="p-topbar" aria-hidden="true">
                <span className="p-ico">
                  <Icon name="close" size={24} />
                </span>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="bar" style={{ flex: 1 }}>
                    <div className="bar-fill" style={{ width: '40%' }} />
                  </div>
                  <span className="t-overline num muted">8 of 20</span>
                </div>
                <span className="p-ico">
                  <Icon name="volume" size={24} />
                </span>
              </div>

              {outcome ? (
                <>
                  <div className="p-scroll" aria-hidden="true" style={{ paddingTop: 8 }}>
                    <p className="t-title2">{QUESTION}</p>
                    <div className="opt-list">
                      {ANSWERS.map((a) => {
                        const correct = a.id === CORRECT_ID
                        const wrong = !correct && a.id === sel
                        return (
                          <div key={a.id} className={`opt ${correct ? 'is-correct' : wrong ? 'is-wrong' : 'is-rest'}`}>
                            {correct || wrong ? (
                              <span className="fb-mark" style={{ display: 'inline-flex' }}>
                                <Icon name={correct ? 'check' : 'close'} />
                              </span>
                            ) : (
                              <span className="radio" />
                            )}
                            <span className="opt-text">{a.text}</span>
                            {correct ? <span className="fb-word">Correct</span> : null}
                            {wrong ? <span className="fb-word">Not quite</span> : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <div className="scrim" aria-hidden="true" />
                  <section className="sheet" aria-labelledby="lqs-result">
                    <div className="grabber" aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0 }} />
                    <div
                      className={`sheet-band ${isRight ? 'fb-correct' : 'fb-wrong'}`}
                      style={{ padding: '24px 16px 16px', borderRadius: '16px 16px 0 0' }}
                    >
                      <span className="band-dot" aria-hidden="true">
                        <Icon name={isRight ? 'check' : 'close'} />
                      </span>
                      <h3
                        id="lqs-result"
                        ref={resultRef}
                        className="t-title2"
                        tabIndex={-1}
                        style={{ flex: 1, outlineOffset: 4 }}
                      >
                        {isRight ? 'Correct' : 'Not quite'}
                        <span className="sr-only">{BAND_SR[outcome]}</span>
                      </h3>
                      {isRight ? <span className="xp-quiet">+10 XP</span> : null}
                    </div>
                    {body}
                    <div className="sheet-foot">
                      <button
                        className="btn btn-primary btn-lg btn-block"
                        type="button"
                        onClick={() => {
                          returnFocus.current = true
                          reset()
                        }}
                      >
                        Try another answer
                      </button>
                    </div>
                  </section>
                </>
              ) : (
                <div className="stack" style={{ flex: '1 1 auto', minHeight: 0 }} role="group" aria-label="Try a question">
                  <div className="p-scroll" style={{ overflowY: 'auto' }}>
                    <p id="lqs-q" className="t-title2">
                      {QUESTION}
                    </p>
                    <div className="opt-list" role="radiogroup" aria-labelledby="lqs-q">
                      {ANSWERS.map((a, i) => {
                        const props = answerProps(a.id, i)
                        return (
                          <button
                            key={a.id}
                            {...props}
                            ref={(el) => {
                              props.ref(el)
                              if (i === 0) firstAnswerRef.current = el
                            }}
                            className={sel === a.id ? 'opt is-selected' : 'opt'}
                          >
                            <span className="radio" aria-hidden="true" />
                            <span className="opt-text">{a.text}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="p-dock">
                    <div>
                      <p id="lqs-conf-l" className="conf-legend">
                        How sure are you?
                      </p>
                      <div className="conf" role="radiogroup" aria-labelledby="lqs-conf-l">
                        {CONFIDENCES.map((c, i) => (
                          <button
                            key={c.id}
                            {...confProps(c.id, i)}
                            className={conf === c.id ? 'conf-btn is-selected' : 'conf-btn'}
                          >
                            <span className="conf-tick" aria-hidden="true">
                              <Icon name="check" size={16} />
                            </span>
                            {c.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      className="btn btn-primary btn-lg btn-block"
                      type="button"
                      disabled={!(sel && conf)}
                      onClick={() => {
                        if (!sel || !conf) return
                        setRevealed(true)
                        setWhyOpen(false)
                      }}
                    >
                      Check
                    </button>
                  </div>
                </div>
              )}
            </PhoneFrame>
          </div>

          <div className="answer-list">
            <h3 id="lqs-outcomes" className="t-label muted" style={{ marginBottom: 12 }}>
              Or jump to an outcome
            </h3>
            <ul className="reveals" aria-labelledby="lqs-outcomes">
              {OUTCOMES.map((r) => {
                const pressed = outcome === r.key
                const right = r.key === 'cs' || r.key === 'cu'
                return (
                  <li key={r.key}>
                    <button
                      className="rv-item"
                      type="button"
                      aria-pressed={pressed}
                      onClick={() => {
                        if (pressed) {
                          returnFocus.current = false
                          reset()
                          return
                        }
                        show(r)
                      }}
                    >
                      <span className="rv-icons">
                        <Icon
                          name={right ? 'check' : 'close'}
                          strokeWidth={2.5}
                          className={right ? 'ic-correct' : 'ic-wrong'}
                        />
                      </span>
                      <span className="rv-title">
                        {r.title}{' '}
                        <span className="rv-showing" aria-hidden="true">
                          Showing
                        </span>
                      </span>
                      <span className="rv-desc">{r.desc}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
