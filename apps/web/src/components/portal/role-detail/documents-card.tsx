import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { AlignLeft, Upload } from 'lucide-react'
import { Banner } from '@/components/admin/banner'
import { RowMenu } from '@/components/admin/row-menu'
import { errorMessage } from '@/components/inline-error'
import { usePortal } from '@/components/portal/portal-context'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { retireRoleDocument, uploadRoleDocument } from '@/server/role-documents'
import type { RoleDetail } from '@/server/role-detail'
import { Dropzone } from './dropzone'
import { FileRow } from './file-row'

const isPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')

export function DocumentsCard({ detail, readOnly, pasteOpen, onTogglePaste, panel }: {
  detail: RoleDetail
  readOnly: boolean
  pasteOpen: boolean
  onTogglePaste: (opener: HTMLElement) => void
  panel: ReactNode
}) {
  const { slug } = usePortal()
  const router = useRouter()
  const upload = useServerFn(uploadRoleDocument)
  const retire = useServerFn(retireRoleDocument)
  const { role, documents } = detail
  const canUpload = !readOnly && (role.topicStatus === 'draft' || role.topicStatus === 'failed')
  const canChange = !readOnly && role.topicStatus !== 'generating'
  const input = useRef<HTMLInputElement>(null)
  const replacing = useRef<string | undefined>(undefined)
  const [uploading, setUploading] = useState('')
  const [error, setError] = useState('')
  const [over, setOver] = useState(false)
  const busy = uploading !== ''
  const startUpload = useRef<(file: File, replacesId?: string) => Promise<void>>(async () => {})

  startUpload.current = async (file, replacesId) => {
    const data = new FormData()
    data.set('slug', slug)
    data.set('roleId', role.id)
    data.set('file', file)
    if (replacesId) data.set('replacesId', replacesId)
    setError('')
    setUploading(file.name)
    try {
      await upload({ data })
      await router.invalidate()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setUploading('')
    }
  }

  useEffect(() => {
    if (!canUpload) return
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const enter = (e: DragEvent) => { if (hasFiles(e)) setOver(true) }
    const overEv = (e: DragEvent) => { if (hasFiles(e)) { e.preventDefault(); setOver(true) } }
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setOver(false) }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      setOver(false)
      const files = Array.from(e.dataTransfer?.files ?? [])
      const file = files.find(isPdf)
      if (file && !busy) void startUpload.current(file)
      else if (files.length && !file) setError('Upload a PDF or paste the text')
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', overEv)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', overEv)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
      setOver(false)
    }
  }, [canUpload, busy])

  function pick(replacesId?: string) {
    replacing.current = replacesId
    input.current?.click()
  }

  function chosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const replacesId = replacing.current
    replacing.current = undefined
    e.target.value = ''
    if (file) void startUpload.current(file, replacesId)
  }

  async function retireDoc(id: string) {
    if (!window.confirm('Retire this document? Its questions stop appearing in practice.')) return
    setError('')
    try {
      await retire({ data: { slug, roleId: role.id, sourceId: id } })
      await router.invalidate()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <section aria-labelledby="rd-documents-h" className="flex flex-col gap-4">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-4">
        <h2 id="rd-documents-h" className="text-title-2">Documents</h2>
        {canUpload && documents.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" aria-expanded={pasteOpen} aria-controls="rd-paste" onClick={(e) => onTogglePaste(e.currentTarget)}><AlignLeft aria-hidden />Paste text</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => pick()}><Upload aria-hidden />Add document</Button>
          </div>
        )}
      </div>
      {canChange && <input ref={input} type="file" accept="application/pdf" hidden tabIndex={-1} aria-hidden onChange={chosen} />}
      {error && <Banner kind="alert">{error}</Banner>}
      {busy && <p role="status" className="text-body text-ink-muted">Uploading {uploading}…</p>}
      {documents.length === 0 ? (
        canUpload ? (
          <Dropzone over={over} busy={busy} pasteOpen={pasteOpen} onPick={() => pick()} onPaste={onTogglePaste} />
        ) : (
          <p className="rounded-md bg-surface-sunken px-6 py-4 text-body text-ink-muted">No documents yet.</p>
        )
      ) : (
        <ul aria-label={`Documents for ${role.name}`} className={cn('rounded-md border bg-surface-card', over ? 'border-brand bg-brand-tint' : 'border-border')}>
          {documents.map((doc) => (
            <FileRow
              key={doc.id}
              doc={doc}
              readOnly={readOnly}
              actions={canChange && (
                <>
                  <Button type="button" variant="ghost" aria-label={`Replace ${doc.title}`} disabled={busy} onClick={() => pick(doc.id)}>
                    <Upload aria-hidden />
                    Replace
                  </Button>
                  <RowMenu label={doc.title} items={[{ label: 'Retire document', onSelect: () => void retireDoc(doc.id) }]} />
                </>
              )}
            />
          ))}
        </ul>
      )}
      {panel}
    </section>
  )
}
