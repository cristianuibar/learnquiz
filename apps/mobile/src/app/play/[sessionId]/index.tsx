import { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, AppState, BackHandler, findNodeHandle, View, type Text as NativeText } from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { isAnswerReady, type Answer, type Confidence, type Draft, type ItemView, type Reveal, type SessionView } from '@learnquiz/api'
import { checkFailedMessage, networkError } from '@learnquiz/api/system-copy'
import { QuestionBody } from '@/components/question/question-body'
import { RevealOverlay } from '@/components/reveal/reveal-overlay'
import { ErrorRow } from '@/components/session/ErrorRow'
import { QuestionDock } from '@/components/session/QuestionDock'
import { ReadAloudButton } from '@/components/session/ReadAloudButton'
import { SessionFrame } from '@/components/session/SessionFrame'
import { SheetHost } from '@/components/sheet/sheet-host'
import { AlertRow } from '@/components/ui/AlertRow'
import { Button } from '@/components/ui/Button'
import { useHeadingFocus } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { api } from '@/lib/api'
import { prepareNext, sessionToPrepare } from '@/lib/prepare-next'
import { answerBody, answerError } from '@/lib/session/answer'
import { deleteDraft, draftForView, writeDraft } from '@/lib/session/draft'
import { sessionRefetchError, type SessionError } from '@/lib/session/error'
import { canAdvance, canLoadSession, noticeFor, revealMarks, type ContinueRequest } from '@/lib/session/overlay'
import { createReadyAnnouncement } from '@/lib/session/ready'
import { voiceSessionId } from '@/lib/session/voice'
import { useSession } from '@/lib/session-store'
import { useTheme } from '@/theme/ThemeProvider'

type Submission = ReturnType<typeof answerBody>
const emptyDraft = (): Draft => ({ answer: {}, confidence: null })
const emptyLocal = () => ({ reflection: '', readAloud: false })

export default function SessionScreen() {
  const params = useLocalSearchParams<{ sessionId: string | string[]; announceReady?: string }>()
  const sessionId = Array.isArray(params.sessionId) ? params.sessionId[0] : params.sessionId
  return <ActiveSession key={sessionId} sessionId={sessionId} announceReady={params.announceReady === '1'} />
}

function ActiveSession({ sessionId, announceReady }: { sessionId: string; announceReady: boolean }) {
  const router = useRouter()
  const { branding } = useSession()
  const { space } = useTheme()
  const [view, setView] = useState<SessionView | null>(null)
  const [announceWhenRendered] = useState(() => createReadyAnnouncement(announceReady, {
    frame: requestAnimationFrame,
    cancelFrame: cancelAnimationFrame,
    announce: (message) => AccessibilityInfo.announceForAccessibility(message),
  }))
  const itemRendered = Boolean(view?.item && !view.ended)
  useEffect(() => announceWhenRendered(itemRendered), [announceWhenRendered, itemRendered])
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [local, setLocal] = useState(emptyLocal)
  const [error, setError] = useState<SessionError | null>(null)
  const [busy, setBusy] = useState(false)
  const [voiceCapturing, setVoiceCapturing] = useState(false)
  const [notice, setNotice] = useState<{ key: string; text: string } | null>(null)
  const viewRef = useRef<SessionView | null>(null)
  const revealRef = useRef<Reveal | null>(null)
  const draftRef = useRef(draft)
  const request = useRef<AbortController | null>(null)
  const submission = useRef<Submission | null>(null)
  const startedAt = useRef(Date.now())
  const mounted = useRef(false)
  const leaving = useRef(false)
  const preparedId = useRef<string | null>(null)
  const dockRef = useRef<View>(null)
  const path = `/sessions/${encodeURIComponent(sessionId)}`

  const active = useCallback(() => mounted.current && !leaving.current, [])

  const applyView = useCallback(async (next: SessionView, signal: AbortSignal, checkedItemId?: string) => {
    if (!active() || signal.aborted) return
    const previousItemId = viewRef.current?.item?.id
    if (next.ended) {
      if (previousItemId) void deleteDraft(sessionId, previousItemId).catch(() => {})
      if (next.item) void deleteDraft(sessionId, next.item.id).catch(() => {})
      viewRef.current = next
      setView(next)
      await api(`${path}/end`, { method: 'POST', signal })
      if (active() && !signal.aborted) {
        leaving.current = true
        router.replace(`/play/${sessionId}/done`)
      }
      return
    }

    const nextDraft = await draftForView(sessionId, viewRef.current, next, checkedItemId)
    if (!active() || signal.aborted) return
    if (nextDraft) {
      draftRef.current = nextDraft
      setDraft(nextDraft)
      setLocal(emptyLocal())
      setError(null)
      submission.current = null
      startedAt.current = Date.now()
    }
    viewRef.current = next
    setView(next)
  }, [active, path, router, sessionId])

  const loadSession = useCallback(async () => {
    // GET advances an answered slot on the server: it must never hide a reveal.
    if (!canLoadSession({ active: active(), inFlight: request.current !== null, overlayOpen: revealRef.current !== null })) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    try {
      const next = await api<SessionView>(path, { signal: controller.signal })
      if (!active() || controller.signal.aborted) return
      await applyView(next, controller.signal)
      if (active() && !controller.signal.aborted) setError((current) => current?.kind === 'load' ? null : current)
    } catch {
      if (active() && !controller.signal.aborted) setError(sessionRefetchError)
    } finally {
      if (request.current === controller) {
        request.current = null
        if (active()) setBusy(false)
      }
    }
  }, [active, applyView, path])

  const endSession = useCallback(() => {
    if (leaving.current) return
    leaving.current = true
    request.current?.abort()
    const itemId = viewRef.current?.item?.id
    if (itemId) void deleteDraft(sessionId, itemId).catch(() => {})
    void api(`${path}/end`, { method: 'POST' }).catch(() => {})
    router.dismissAll()
    router.replace('/(tabs)/today')
  }, [path, router, sessionId])

  useEffect(() => {
    mounted.current = true
    void loadSession()
    return () => {
      mounted.current = false
      request.current?.abort()
      request.current = null
    }
  }, [loadSession])

  useEffect(() => {
    const id = sessionToPrepare(viewRef.current, preparedId.current, active())
    if (!id) return
    preparedId.current = id
    void prepareNext(id)
  }, [active, view])

  useFocusEffect(useCallback(() => {
    let previousState = AppState.currentState
    const foreground = AppState.addEventListener('change', (next) => {
      const returning = next === 'active' && previousState !== 'active'
      previousState = next
      if (returning) void loadSession()
    })
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (revealRef.current) return false // The sheet owns its Back behavior.
      endSession()
      return true
    })
    return () => { foreground.remove(); back.remove() }
  }, [endSession, loadSession]))

  useEffect(() => {
    if (error?.kind !== 'check' || busy) return
    const frame = requestAnimationFrame(() => {
      // React Native's public element traversal reaches the dock's final child,
      // its CheckButton, without changing the shared question-parts API.
      const retry = dockRef.current?.firstElementChild?.lastElementChild
      const tag = retry && findNodeHandle(retry as unknown as View)
      if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag)
    })
    return () => cancelAnimationFrame(frame)
  }, [error, busy])

  function changeDraft(next: Draft) {
    const item = viewRef.current?.item
    if (!item || request.current || revealRef.current || leaving.current) return
    draftRef.current = next
    setDraft(next)
    setError(null)
    submission.current = null
    void writeDraft(sessionId, item.id, next).catch(() => {})
  }

  async function check() {
    const item = viewRef.current?.item
    const currentDraft = draftRef.current
    if (!item || !active() || request.current || revealRef.current || currentDraft.confidence === null || !isAnswerReady(item.format, currentDraft.answer, item.options.length)) return
    // Keep the complete request, including response time, stable for Try again.
    const body = submission.current ?? answerBody(item, currentDraft, Math.max(0, Date.now() - startedAt.current))
    submission.current = body
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    let saved = true
    let resyncing = false
    try {
      await writeDraft(sessionId, item.id, currentDraft).catch(() => { saved = false })
      const result = await api<Reveal>(`${path}/answer`, { body, timeoutMs: 130_000, signal: controller.signal })
      if (!active() || controller.signal.aborted) return
      revealRef.current = result
      setReveal(result)
      setError(null)
      void deleteDraft(sessionId, item.id).catch(() => {})
    } catch (failure) {
      if (!active() || controller.signal.aborted) return
      if (answerError(failure) === 'resync') {
        resyncing = true
        await deleteDraft(sessionId, item.id).catch(() => {})
        if (!active() || controller.signal.aborted) return
        try {
          const next = await api<SessionView>(path, { signal: controller.signal })
          if (active()) await applyView(next, controller.signal, item.id)
          if (active() && !controller.signal.aborted) setError(null)
        } catch {
          if (active() && !controller.signal.aborted) setError({ kind: 'load', message: networkError })
        }
      } else {
        setError({ kind: 'check', message: checkFailedMessage(saved, 'phone') })
      }
    } finally {
      if (request.current === controller) {
        if (resyncing) submission.current = null
        request.current = null
        if (active()) setBusy(false)
      }
    }
  }

  async function continueSession({ why, reported }: ContinueRequest) {
    if (!canAdvance({ active: active(), inFlight: request.current !== null, overlayOpen: revealRef.current !== null })) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError(null)
    try {
      const next = await api<SessionView>(`${path}/next`, { body: { why }, signal: controller.signal })
      if (!active() || controller.signal.aborted) return
      revealRef.current = null
      setReveal(null)
      setNotice(reported && next.item ? { key: `${next.item.id}:${next.progress.position}`, text: 'Report sent' } : null)
      await applyView(next, controller.signal)
    } catch {
      if (active() && !controller.signal.aborted) setError({ kind: revealRef.current ? 'next' : 'load', message: networkError })
    } finally {
      if (request.current === controller) {
        request.current = null
        if (active()) setBusy(false)
      }
    }
  }

  const item = view?.item
  const dock = item && !view.ended ? (
    <>
      {error?.kind === 'check' ? (
        <View style={{ paddingHorizontal: space[4], paddingBottom: space[3] }}>
          <ErrorRow message={error.message} />
        </View>
      ) : null}
      <View ref={dockRef} collapsable={false}>
        <QuestionDock
          item={item}
          answer={draft.answer}
          confidence={draft.confidence}
          onConfidenceChange={(confidence: Confidence) => changeDraft({ ...draftRef.current, confidence })}
          onSubmit={() => { void check() }}
          busy={busy}
          disabled={reveal !== null}
          mode={error?.kind === 'check' ? 'retry' : 'check'}
        />
      </View>
    </>
  ) : undefined

  return (
    <SheetHost sheet={reveal && item ? (
      <RevealOverlay
        key={`${item.id}:${view.progress.position}:${reveal.attemptId ?? ''}`}
        reveal={reveal}
        item={item}
        answer={draft.answer}
        confidence={draft.confidence}
        onContinue={(request) => { void continueSession(request) }}
        busy={busy}
        error={error?.kind === 'next' ? error.message : null}
        branding={branding}
      />
    ) : null}>
      <SessionFrame progress={view?.progress} onEnd={endSession} inert={reveal !== null} dock={dock} trailing={
        <ReadAloudButton
          item={view?.ended ? null : item ?? null}
          itemKey={item ? `${item.id}:${view.progress.position}` : null}
          blocked={busy || reveal !== null || voiceCapturing}
        />
      }>
        {error?.kind === 'load' ? (
          <View style={{ gap: space[3] }}>
            <AlertRow>{error.message}</AlertRow>
            <Button variant="secondary" busy={busy} onPress={() => { void loadSession() }}>Try again</Button>
          </View>
        ) : null}
        {item && !view.ended ? (
          <SessionQuestion
            key={`${item.id}:${view.progress.position}`}
            item={item}
            notice={noticeFor(notice, `${item.id}:${view.progress.position}`)}
            marks={revealMarks(reveal, item.format, draft.answer)}
            answer={draft.answer}
            onAnswer={(answer) => changeDraft({ ...draftRef.current, answer })}
            disabled={busy || reveal !== null}
            onSubmit={() => { void check() }}
            voiceSessionId={voiceSessionId(view)}
            onVoiceCapture={setVoiceCapturing}
          />
        ) : !error ? <Text accessibilityLiveRegion="polite">{view?.ended ? 'Ending your session…' : 'Loading your session…'}</Text> : null}
      </SessionFrame>
    </SheetHost>
  )
}

function SessionQuestion({ item, notice, marks, answer, onAnswer, disabled, onSubmit, voiceSessionId, onVoiceCapture }: {
  item: ItemView
  notice: string | null
  marks: ReturnType<typeof revealMarks>
  answer: Answer
  onAnswer(answer: Answer): void
  disabled: boolean
  onSubmit(): void
  voiceSessionId: string | null
  onVoiceCapture(capturing: boolean): void
}) {
  const { space } = useTheme()
  useEffect(() => {
    if (notice) AccessibilityInfo.announceForAccessibility(notice)
  }, [notice])
  return (
    <View style={{ gap: space[6] }}>
      {notice ? <Text variant="caption" muted>{notice}</Text> : null}
      {item.format !== 'cloze' ? <SessionStem stem={item.stem} /> : null}
      <QuestionBody key={item.id} item={item} answer={answer} onAnswer={onAnswer} marks={marks} disabled={disabled} onSubmit={onSubmit} voiceSessionId={voiceSessionId} onVoiceCapture={onVoiceCapture} />
    </View>
  )
}

function SessionStem({ stem }: { stem: string }) {
  const stemRef = useRef<NativeText>(null)
  useHeadingFocus(stemRef)
  return <Text ref={stemRef} variant="title2" header>{stem}</Text>
}
