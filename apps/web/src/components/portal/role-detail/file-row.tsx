import type { ReactNode } from 'react'
import { AlignLeft, FileText } from 'lucide-react'
import type { RoleDetail } from '@/server/role-detail'
import { Meter } from '@/components/admin/meter'
import { Status } from '@/components/admin/status-chip'
import { Button } from '@/components/ui/button'
import { plural } from '@/lib/utils'

type Doc = RoleDetail['documents'][number]

const day = (at: number) => new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export function fileMeta(doc: Doc) {
  const isPdf = doc.kind === 'pdf'
  return [
    isPdf ? 'PDF' : 'Pasted text',
    isPdf ? (doc.pageCount ? plural(doc.pageCount, 'page', 'pages') : null) : `${doc.chars.toLocaleString('en-US')} characters`,
    day(doc.createdAt),
    doc.uploaderName || null,
  ].filter(Boolean).join(' · ')
}

/** One document: type icon, title, version tag, meta line and an optional actions slot. */
export function FileRow({ doc, actions, readOnly }: { doc: Doc; actions?: ReactNode; readOnly?: boolean }) {
  const Icon = doc.kind === 'pdf' ? FileText : AlignLeft
  return (
    <li className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 border-b border-border p-4 last:border-b-0 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:px-6 sm:py-4">
      <Icon aria-hidden className="size-10 p-2 text-ink-muted" />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 break-words text-[15px]/[22px] font-semibold text-ink">
          {doc.title}
          <span className="inline-flex h-6 items-center rounded-sm bg-surface-sunken px-2 text-[13px]/[18px] font-semibold text-ink">v{doc.version}</span>
        </p>
        <p className="text-[13px]/[18px] font-medium tabular-nums text-ink-muted">{fileMeta(doc)}</p>
      </div>
      {!readOnly && actions && <div className="col-start-2 flex items-center gap-1 sm:col-start-3">{actions}</div>}
    </li>
  )
}

export const mb = (bytes: number) => (bytes / 1048576).toFixed(1)

/** The in-flight upload, shown as the first row of the documents list. */
export function UploadingRow({ name, loaded, total, onCancel }: { name: string; loaded: number; total: number; onCancel: () => void }) {
  const text = `${mb(loaded)} of ${mb(total)} MB`
  return (
    <li className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 border-b border-border p-4 last:border-b-0 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:px-6 sm:py-4">
      <FileText aria-hidden className="size-10 p-2 text-ink-muted" />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 break-words text-[15px]/[22px] font-semibold text-ink">
          {name}
          <Status word="Uploading" />
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Meter className="w-60 max-w-full" label={`Uploading ${name}`} value={total > 0 ? Math.round((loaded / total) * 100) : 0} max={100} valueText={text} />
          <span className="text-[13px]/[18px] font-medium tabular-nums text-ink-muted">{text}</span>
        </div>
      </div>
      <div className="col-start-2 flex items-center gap-1 sm:col-start-3">
        <Button id="rd-cancel-upload" type="button" variant="ghost" onClick={onCancel}>Cancel upload</Button>
      </div>
    </li>
  )
}
