import type { ReactNode } from 'react'
import { SiteFooter } from './site-footer'
import { SiteHeader } from './site-header'

export type LegalBlock = string | { items: string[] }

export type LegalSection = {
  id: string
  heading: string
  blocks: LegalBlock[]
}

const PLACEHOLDER = /(\{[^{}]*\}|\[[^[\]]*\])/

// Splits a string into plain text and .ph chips for any {…} or […] placeholder, keeping the bracket text unchanged.
export function withPlaceholders(value: string): ReactNode[] {
  return value
    .split(PLACEHOLDER)
    .filter(Boolean)
    .map((part, index) =>
      PLACEHOLDER.test(part) ? (
        <span key={index} className="ph">
          {part}
        </span>
      ) : (
        part
      ),
    )
}

export function LegalNotice({
  id,
  title,
  updated,
  sections,
}: {
  id: string
  title: string
  updated?: string
  sections: LegalSection[]
}) {
  const titleId = `${id}-title`
  return (
    <div className="site">
      <SiteHeader variant="legal" />
      <main id="main" tabIndex={-1}>
        <article className="legal" aria-labelledby={titleId}>
          <div className="wrap">
            <div className="legal-in">
              <div className="stack gap-2">
                <h1 id={titleId} className="t-title1">
                  {title}
                </h1>
                {updated ? <p className="t-caption muted">Last updated {withPlaceholders(updated)}</p> : null}
              </div>
              {sections.map((section) => {
                const headingId = `${id}-${section.id}`
                return (
                  <section key={section.id} className="stack gap-3" aria-labelledby={headingId}>
                    <h2 id={headingId}>{section.heading}</h2>
                    {section.blocks.map((block, index) =>
                      typeof block === 'string' ? (
                        <p key={index}>{withPlaceholders(block)}</p>
                      ) : (
                        <ul key={index}>
                          {block.items.map((item) => (
                            <li key={item}>{withPlaceholders(item)}</li>
                          ))}
                        </ul>
                      ),
                    )}
                  </section>
                )
              })}
            </div>
          </div>
        </article>
      </main>
      <SiteFooter variant="legal" />
    </div>
  )
}
