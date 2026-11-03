import { FileText } from 'lucide-react'

export function SourceQuote({
  quote,
  title,
  version,
}: {
  quote: string
  title: string | null
  version: number | null
}) {
  return (
    <figure className="flex flex-col gap-2 rounded-md bg-surface-sunken px-4 py-3">
      <blockquote className="text-body text-ink">{`“${quote}”`}</blockquote>
      {title !== null && (
        <figcaption className="flex items-center gap-1 text-caption text-ink-muted">
          <FileText aria-hidden className="size-4 shrink-0" />
          {version === null ? title : `${title} · v${version}`}
        </figcaption>
      )}
    </figure>
  )
}
