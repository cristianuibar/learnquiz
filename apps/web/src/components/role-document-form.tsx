import { useId, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { errorMessage } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MAX_ROLE_DOCUMENT_BYTES, MAX_ROLE_DOCUMENT_CHARS } from '@/lib/limits'
import { uploadRoleDocument } from '@/server/role-documents'

const helpText = `A PDF with selectable text up to ${MAX_ROLE_DOCUMENT_BYTES / (1024 * 1024)} MB, or pasted text up to ${MAX_ROLE_DOCUMENT_CHARS.toLocaleString('en-US')} characters.`

export function RoleDocumentForm({ slug, roleId, roleName, onUploaded, replaces }: { slug: string; roleId: string; roleName: string; onUploaded: () => unknown; replaces?: { id: string; title: string } }) {
  const uid = useId()
  const upload = useServerFn(uploadRoleDocument)
  const [error, setError] = useState('')
  const [added, setAdded] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    formData.set('slug', slug)
    formData.set('roleId', roleId)
    setError('')
    setAdded(false)
    setBusy(true)
    try {
      await upload({ data: formData })
      form.reset()
      setAdded(true)
      await onUploaded()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="mt-3">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        {replaces ? <>Replace<span className="sr-only"> {replaces.title}</span></> : 'Add a document'}
      </summary>
      <form className="mt-3 flex flex-col gap-4" onSubmit={submit} aria-label={replaces ? `Replace ${replaces.title}` : `Add a document for ${roleName}`}>
        {replaces && <input type="hidden" name="replacesId" value={replaces.id} />}
        <p id={`${uid}-doc-help`} className="text-sm text-muted-foreground">{helpText}</p>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-doc-title`}>{replaces ? 'Document title (optional)' : 'Document title'}</Label>
          <Input id={`${uid}-doc-title`} name="title" className="h-11" maxLength={200} placeholder={replaces?.title} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-doc-file`}>PDF</Label>
          <Input id={`${uid}-doc-file`} name="file" type="file" accept="application/pdf,.pdf" className="h-11" aria-describedby={`${uid}-doc-help`} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-doc-text`}>Or paste the text</Label>
          <Textarea id={`${uid}-doc-text`} name="text" className="min-h-32" maxLength={MAX_ROLE_DOCUMENT_CHARS} aria-describedby={`${uid}-doc-help`} />
        </div>
        {error && <p role="alert" className="text-sm font-medium text-wrong">{error}</p>}
        {added && <p role="status" className="text-sm font-medium">Document added.</p>}
        <Button type="submit" className="h-11 self-end px-6" disabled={busy}>
          {busy ? 'Uploading…' : replaces ? 'Replace document' : 'Add document'}
        </Button>
      </form>
    </details>
  )
}
