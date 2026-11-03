import { useEffect, useRef, useState } from 'react'
import { Icon } from '../ui/icon'
import { LogoMark } from '../ui/logo'
import { PhoneFrame } from '../ui/phone-frame'

const options = [
  'Report a short pick on the scanner',
  'Take one from the next slot',
  'Skip it and come back',
  'Wait for a restock',
]

export function PushQuestions() {
  const rowRef = useRef<HTMLOListElement>(null)
  const [scrolls, setScrolls] = useState(false)

  useEffect(() => {
    const checkOverflow = () => {
      const row = rowRef.current
      setScrolls(!!row && row.scrollWidth > row.clientWidth + 1)
    }
    checkOverflow()
    window.addEventListener('resize', checkOverflow)
    return () => window.removeEventListener('resize', checkOverflow)
  }, [])

  return (
    <section aria-labelledby="lqs-push" className="section">
      <div className="wrap">
        <div className="push-head">
          <h2 id="lqs-push" className="h-section">Between tasks, one question at a time.</h2>
        </div>

        <ol
          ref={rowRef}
          className="push-row"
          aria-label="From push to done, three screens"
          tabIndex={scrolls ? 0 : undefined}
        >
          <li className="push-step">
            <PhoneFrame
              os
              label="Lock screen at 9:41 with a Learn Quiz notification: Your pick slot is empty. What do you do first?"
              screenClassName="px-3 pt-[72px] pb-2"
            >
              <div className="stack mb-10 items-center gap-1">
                <p className="num text-[56px] leading-[64px] font-normal tracking-[-0.02em] text-(--os-ink)">9:41</p>
                <p className="t-body text-(--os-ink-muted)">Tuesday, November 3</p>
              </div>
              <div className="stack gap-2 rounded-2xl bg-(--os-card) p-[14px]">
                <span className="flex items-center gap-2 text-(--os-ink-muted)">
                  <span className="inline-flex size-5 items-center justify-center rounded-full bg-(--brand)">
                    <LogoMark size={16} mono />
                  </span>
                  <span className="t-caption">Learn Quiz · now</span>
                </span>
                <span className="t-body font-semibold text-(--os-ink)">Your pick slot is empty. What do you do first?</span>
              </div>
            </PhoneFrame>
            <div className="push-cap flex flex-col gap-0.5">
              <h3 className="t-label">The push is the question</h3>
              <p className="t-body muted">Under 60 characters, nothing else.</p>
            </div>
          </li>

          <li className="push-step">
            <PhoneFrame label="A one-question session: Your pick slot is empty. What do you do first? Report a short pick on the scanner is selected, and Sure.">
              <div className="p-topbar">
                <span className="p-ico"><Icon name="close" size={24} /></span>
                <span className="t-overline muted flex-1">1 question</span>
              </div>
              <div className="p-scroll gap-4">
                <p className="t-title2">Your pick slot is empty. What do you do first?</p>
                <div className="opt-list gap-2">
                  {options.map((option, index) => (
                    <div key={option} className={`opt min-h-12 cursor-default px-3 py-2 text-[15px] leading-[22px]${index === 0 ? ' is-selected' : ''}`}>
                      <span className="radio" />
                      <span className="opt-text">{option}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-dock">
                <div className="conf">
                  <span className="conf-btn is-selected cursor-default"><span className="conf-tick"><Icon name="check" size={16} /></span>Sure</span>
                  <span className="conf-btn cursor-default">Unsure</span>
                  <span className="conf-btn cursor-default">Guessing</span>
                </div>
                <span className="p-btn p-btn-primary">Check</span>
              </div>
            </PhoneFrame>
            <div className="push-cap flex flex-col gap-0.5">
              <h3 className="t-label">One question</h3>
              <p className="t-body muted">Answer it and say how sure you are.</p>
            </div>
          </li>

          <li className="push-step">
            <PhoneFrame label="Done screen: Report a short pick on the scanner, with the quote from Warehouse picker SOPs, section 2.4. One review cleared, three left today.">
              <div className="p-topbar">
                <span className="p-ico"><Icon name="close" size={24} /></span>
              </div>
              <div className="p-scroll gap-4">
                <div className="card stack gap-1">
                  <span className="t-label flex items-center gap-1.5 text-(--brand)"><Icon name="check" size={18} />1 review cleared</span>
                  <p className="t-body-lg">Report a short pick on the scanner.</p>
                </div>
                <div className="quote">
                  <p className="quote-text">“If the slot is empty, report a short pick on the scanner. Don’t take stock from another slot.”</p>
                  <p className="quote-src">Warehouse picker SOPs v3 · §2.4</p>
                </div>
                <p className="t-label muted">3 left today</p>
              </div>
              <div className="p-dock border-t-0">
                <span className="p-btn p-btn-primary">Back to Today</span>
              </div>
            </PhoneFrame>
            <div className="push-cap flex flex-col gap-0.5">
              <h3 className="t-label">The answer, with its source</h3>
              <p className="t-body muted">Then back to work.</p>
            </div>
          </li>
        </ol>

        <div className="push-facts">
          <div className="fact">
            <h3 className="t-title2">Working hours only</h3>
            <p className="t-body muted">Pushes arrive during working hours. Nothing at night or on days off.</p>
          </div>
          <div className="fact">
            <h3 className="t-title2">Ignoring one is fine</h3>
            <p className="t-body muted">A push left unanswered is never penalized. The question waits for the next session.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
