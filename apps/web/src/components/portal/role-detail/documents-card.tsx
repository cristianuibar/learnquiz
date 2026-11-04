import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { AlignLeft, Upload, X } from 'lucide-react'
import { Banner } from '@/components/admin/banner'
import { RowMenu } from '@/components/admin/row-menu'
import { errorMessage } from '@/components/inline-error'
import { usePortal } from '@/components/portal/portal-context'
import { Button } from '@/components/ui/button'
import { MAX_ROLE_DOCUMENT_BYTES } from '@/lib/limits'
import { cn } from '@/lib/utils'
import { retireRoleDocument } from '@/server/role-documents'
import type { RoleDetail } from '@/server/role-detail'
import { Dropzone } from './dropzone'
import { FileRow, mb, UploadingRow } from './file-row'
import type { Upload as UploadApi } from './use-upload'

const isPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')

export function DocumentsCard({ detail, readOnly, pasteOpen, onTogglePaste, panel, uploader, finishing }: {
  detail: RoleDetail
  readOnly: boolean
  pasteOpen: boolean
  onTogglePaste: (opener: HTMLElement) => void
  panel: ReactNode
  uploader: UploadApi
  /** The upload finished and the reloaded list has not arrived yet. */
  finishing: { name: string; size: number } | null
}) {
  const { slug } = usePortal()
  const router = useRouter()
  const retire = useServerFn(retireRoleDocument)
  const { role, documents } = detail
  const canUpload = !readOnly && (role.topicStatus === 'draft' || role.topicStatus === 'failed')
  const canChange = !readOnly && role.topicStatus !== 'generating'
  const input = useRef<HTMLInputElement>(null)
  const replacing = useRef<string | undefined>(undefined)
  const [error, setError] = useState('')
  const [reject, setReject] = useState('')
  const [over, setOver] = useState(false)
  const { state, cancel, upload } = uploader
  const sending = typeof state === 'object' && 'loaded' in state
  const busy = sending || finishing !== null
  const serverError = typeof state === 'object' && 'error' in state ? `${state.file.name} wasn't uploaded. ${state.error}` : ''
  const startUpload = useRef<(file: File, replacesId?: string) => void>(() => {})

  startUpload.current = (file, replacesId) => {
    if (busy) return
    if (!isPdf(file)) return setReject(`${file.name} wasn't uploaded. Upload a PDF or paste the text.`)
    if (file.size > MAX_ROLE_DOCUMENT_BYTES) {
      return setReject(`${file.name} wasn't uploaded. It's ${mb(file.size)} MB; the limit is 10 MB. Split it or export a smaller PDF.`)
    }
    setReject('')
    upload(file, { replacesId })
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
      if (file) startUpload.current(file)
      else if (files.length) startUpload.current(files[0]!)
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
    if (file) startUpload.current(file, replacesId)
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
      {(reject || serverError) && (
        <Banner
          kind="alert"
          action={<Button type="button" variant="ghost" size="icon" aria-label="Dismiss" onClick={reject ? () => setReject('') : cancel}><X aria-hidden /></Button>}
        >
          {reject || serverError}
        </Banner>
      )}
      {documents.length === 0 && !busy ? (
        canUpload ? (
          <Dropzone over={over} busy={busy} pasteOpen={pasteOpen} onPick={() => pick()} onPaste={onTogglePaste} />
        ) : (
          <p className="rounded-md bg-surface-sunken px-6 py-4 text-body text-ink-muted">No documents yet.</p>
        )
      ) : (
        <ul aria-label={`Documents for ${role.name}`} className={cn('rounded-md border bg-surface-card', over ? 'border-brand bg-brand-tint' : 'border-border')}>
          {busy && (
            <UploadingRow
              name={sending ? state.file.name : finishing!.name}
              loaded={sending ? state.loaded : finishing!.size}
              total={sending ? state.total : finishing!.size}
              onCancel={cancel}
            />
          )}
          {documents.map((doc) => (
            <FileRow
              key={doc.id}
              doc={doc}
              readOnly={readOnly}
              actions={canChange && (
                <>
                  <Button id={`rd-replace-${doc.id}`} type="button" variant="ghost" aria-label={`Replace ${doc.title}`} disabled={busy} onClick={() => pick(doc.id)}>
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
