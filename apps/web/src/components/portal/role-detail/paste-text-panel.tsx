import { useEffect, useId, useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { FieldError, fieldProps } from '@/components/admin/field-error'
import { TextCount } from '@/components/admin/text-count'
import { errorMessage, fieldErrors } from '@/components/inline-error'
import { usePortal } from '@/components/portal/portal-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MAX_ROLE_DOCUMENT_CHARS } from '@/lib/limits'
import { uploadRoleDocument } from '@/server/role-documents'

const fmt = (n: number) => n.toLocaleString('en-US')
const overMessage = (count: number, max: number) =>
  `${fmt(count)} / ${fmt(max)} characters. Remove ${fmt(count - max)} or upload a PDF instead.`

export function PasteTextPanel({ roleId, onClose, onAdded }: { roleId: string; onClose: () => void; onAdded: () => unknown }) {
  const { slug } = usePortal()
  const upload = useServerFn(uploadRoleDocument)
  const uid = useId()
  const titleId = 'rd-paste-title'
  const textId = 'rd-paste-text'
  const countId = 'rd-paste-count'
  const titleRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<{ title?: string; text?: string }>({})
  const [general, setGeneral] = useState('')

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const over = text.length > MAX_ROLE_DOCUMENT_CHARS
  const disabled = busy || over || !text.trim()

  async function add() {
    if (disabled) return
    const formData = new FormData()
    formData.set('slug', slug)
    formData.set('roleId', roleId)
    formData.set('title', title)
    formData.set('text', text)
    setErrors({})
    setGeneral('')
    setBusy(true)
    try {
      await upload({ data: formData })
      await onAdded()
    } catch (err) {
      const fe = fieldErrors(err)
      const message = errorMessage(err)
      if (fe.title || fe.text) setErrors({ title: fe.title, text: fe.text })
      else if (/title/i.test(message)) setErrors({ title: message })
      else setGeneral(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section id="rd-paste" aria-labelledby="rd-paste-h" className="rounded-md border border-border bg-surface-card">
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <h3 id="rd-paste-h" className="text-label font-semibold text-ink">
          Paste text
        </h3>
        <div className="flex flex-col gap-2">
          <Label htmlFor={titleId}>Title</Label>
          <Input
            ref={titleRef}
            id={titleId}
            type="text"
            autoComplete="off"
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            {...fieldProps(titleId, errors.title)}
          />
          {errors.title && <FieldError id={titleId}>{errors.title}</FieldError>}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-4">
            <Label htmlFor={textId}>Text</Label>
            <TextCount id={countId} value={text} max={MAX_ROLE_DOCUMENT_CHARS} overMessage={overMessage} />
          </div>
          <Textarea
            id={textId}
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={over || errors.text ? true : undefined}
            aria-describedby={errors.text && !over ? `${textId}-error` : countId}
          />
          {errors.text && !over && <FieldError id={textId}>{errors.text}</FieldError>}
        </div>
        {general && (
          <p id={`${uid}-general`} role="alert" className="text-label text-ink">
            {general}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-3 border-t border-border px-4 py-4 sm:px-6">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={disabled} onClick={add}>
          {busy ? 'Adding…' : 'Add text'}
        </Button>
      </div>
    </section>
  )
}
