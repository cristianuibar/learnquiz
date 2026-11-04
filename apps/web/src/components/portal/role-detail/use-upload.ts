import { useCallback, useEffect, useRef, useState } from 'react'

export type UploadResult = { sourceId: string; topicId: string; r2Key: string; chars: number; version: number }
export type UploadState =
  | 'idle'
  | { file: File; loaded: number; total: number; sent?: boolean }
  | { file: File; error: string }
export type Upload = {
  upload: (file: File, opts?: { title?: string; replacesId?: string }) => void
  cancel: () => void
  state: UploadState
}

/**
 * Posts a PDF to the role documents route with byte progress. Cancel aborts and also dismisses a server error.
 * Once the whole body is sent the server stores the document regardless, so Cancel no longer aborts: the hook waits
 * for the response and hands it to onDone, keeping the new document in view.
 */
export function useUpload({ orgSlug, roleId, onDone }: {
  orgSlug: string
  roleId: string
  onDone: (result: UploadResult, file: File) => void | Promise<void>
}): Upload {
  const [state, setState] = useState<UploadState>('idle')
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const sent = useRef(false)
  const done = useRef(onDone)
  done.current = onDone

  const cancel = useCallback(() => {
    if (xhrRef.current && sent.current) return
    const xhr = xhrRef.current
    xhrRef.current = null
    xhr?.abort()
    setState('idle')
  }, [])

  useEffect(() => () => {
    const xhr = xhrRef.current
    xhrRef.current = null
    xhr?.abort()
  }, [])

  const upload = useCallback((file: File, opts: { title?: string; replacesId?: string } = {}) => {
    xhrRef.current?.abort()
    const xhr = new XMLHttpRequest()
    xhrRef.current = xhr
    sent.current = false
    const live = () => xhrRef.current === xhr
    const fail = (error: string) => {
      if (!live()) return
      xhrRef.current = null
      setState({ file, error })
    }
    const form = new FormData()
    form.set('file', file)
    if (opts.title) form.set('title', opts.title)
    if (opts.replacesId) form.set('replacesId', opts.replacesId)
    setState({ file, loaded: 0, total: file.size })
    xhr.open('POST', `/api/org/${encodeURIComponent(orgSlug)}/roles/${encodeURIComponent(roleId)}/documents`)
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => {
      if (live()) setState({ file, loaded: e.loaded, total: e.total || file.size })
    }
    xhr.upload.onload = () => {
      if (!live()) return
      sent.current = true
      setState({ file, loaded: file.size, total: file.size, sent: true })
    }
    xhr.onerror = () => fail('Upload failed')
    xhr.onload = async () => {
      if (!live()) return
      let body: unknown = null
      try { body = JSON.parse(xhr.responseText) } catch { /* not JSON */ }
      if (xhr.status < 200 || xhr.status >= 300) {
        const msg = (body as { error?: unknown } | null)?.error
        fail(typeof msg === 'string' && msg ? msg : 'Upload failed')
        return
      }
      try {
        await done.current(body as UploadResult, file)
      } finally {
        if (live()) {
          xhrRef.current = null
          setState('idle')
        }
      }
    }
    xhr.send(form)
  }, [orgSlug, roleId])

  return { upload, cancel, state }
}
