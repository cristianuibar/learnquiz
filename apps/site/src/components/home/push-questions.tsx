import { useEffect, useRef, useState } from 'react'
import { LogoMark } from '../ui/logo'
import { PhoneFrame } from '../ui/phone-frame'

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
          aria-label="A push, a question and its explanation"
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
            <PhoneFrame>
              <picture className="absolute inset-0">
                <source
                  media="(prefers-color-scheme: dark)"
                  srcSet="/screenshots/phone-question-confidence-dark.webp 1x, /screenshots/phone-question-confidence-dark@2x.webp 2x"
                />
                <img
                  src="/screenshots/phone-question-confidence.webp"
                  srcSet="/screenshots/phone-question-confidence.webp 1x, /screenshots/phone-question-confidence@2x.webp 2x"
                  alt="Learn Quiz question 1 of 2: Where do you move the tote to start the check? To the assigned checking station and Sure are selected."
                  width={360}
                  height={740}
                  loading="lazy"
                  className="block size-full object-fill"
                />
              </picture>
            </PhoneFrame>
            <div className="push-cap flex flex-col gap-0.5">
              <h3 className="t-label">Answer and choose your confidence</h3>
              <p className="t-body muted">Move the tote to its assigned checking station.</p>
            </div>
          </li>

          <li className="push-step">
            <PhoneFrame>
              <picture className="absolute inset-0">
                <source
                  media="(prefers-color-scheme: dark)"
                  srcSet="/screenshots/phone-reveal-why-dark.webp 1x, /screenshots/phone-reveal-why-dark@2x.webp 2x"
                />
                <img
                  src="/screenshots/phone-reveal-why.webp"
                  srcSet="/screenshots/phone-reveal-why.webp 1x, /screenshots/phone-reveal-why@2x.webp 2x"
                  alt="Correct answer: To the assigned checking station. The expanded Why explanation quotes Warehouse picker SOP v1: Move the tote to the assigned checking station and scan its label."
                  width={360}
                  height={740}
                  loading="lazy"
                  className="block size-full object-fill"
                />
              </picture>
            </PhoneFrame>
            <div className="push-cap flex flex-col gap-0.5">
              <h3 className="t-label">The answer, with its source</h3>
              <p className="t-body muted">Why it is correct, with a quote from your SOP.</p>
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
