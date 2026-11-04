import { useEffect, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { Page } from '@/components/admin/page'
import { usePortalLinks } from '@/components/portal/portal-context'
import { Button } from '@/components/ui/button'

type What = 'role' | 'person' | 'question'

const COPY: Record<What, { title: string; reason: string; list: string }> = {
  role: { title: 'Role not found', reason: 'the role was renamed', list: 'View roles' },
  person: { title: 'Person not found', reason: 'the person was removed', list: 'View people' },
  question: { title: 'Question not found', reason: 'the question was retired', list: 'View questions' },
}

// Rendered inside the portal layout, so the nav stays and shows no current item.
export function PortalNotFound({ what }: { what: What }) {
  const links = usePortalLinks()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  const { title, reason, list } = COPY[what]
  const listLink = { role: links.roles, person: links.people, question: links.questions({}) }[what]
  return (
    <Page capped>
      <section aria-labelledby="not-found-heading" className="flex max-w-[560px] flex-col gap-4">
        <h1 id="not-found-heading" ref={heading} tabIndex={-1} className="text-title-1 text-ink outline-none">{title}</h1>
        <p className="text-body-lg text-ink-muted">The link may be wrong, or {reason}.</p>
        <div className="flex flex-wrap gap-3 max-sm:[&>*]:w-full">
          <Button asChild className="px-6"><Link {...links.overview}>Go to Overview</Link></Button>
          <Button asChild variant="secondary" className="px-6"><Link {...listLink} activeOptions={{ exact: true }}>{list}</Link></Button>
        </div>
      </section>
    </Page>
  )
}
