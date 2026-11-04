import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, BackHandler, findNodeHandle, Keyboard, View, type Text as NativeText, type ViewStyle } from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Flag } from 'lucide-react-native'
import type { Answer, Confidence, Draft, ItemView } from '@learnquiz/api'
import { offlineBody, offlineTitle } from '@learnquiz/api/system-copy'
import { QuickResult } from '@/components/after-session/QuickResult'
import { QuestionBody } from '@/components/question/question-body'
import { ReportSheet } from '@/components/reveal/report-sheet'
import { QuestionDock } from '@/components/session/QuestionDock'
import { ReadAloudButton } from '@/components/session/ReadAloudButton'
import { SessionFrame } from '@/components/session/SessionFrame'
import { SessionSkeleton } from '@/components/session-skeleton'
import { Sheet } from '@/components/sheet/sheet'
import { SheetHost } from '@/components/sheet/sheet-host'
import { AlertRow } from '@/components/ui/AlertRow'
import { Button } from '@/components/ui/Button'
import { LinkButton } from '@/components/ui/LinkButton'
import { useHeadingFocus } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { api } from '@/lib/api'
import { resultHaptic } from '@/lib/haptics'
import { createQuickSession, type QuickSessionState } from '@/lib/quick-result'
import { MULTI_CAPTION } from '@/lib/session/multi'
import { useSession } from '@/lib/session-store'
import { useTheme } from '@/theme/ThemeProvider'

const TODAY = '/(tabs)/today' as const

export default function QuickSessionScreen() {
  const params = useLocalSearchParams<{ itemId: string | string[]; pushId?: string | string[] }>()
  const itemId = Array.isArray(params.itemId) ? params.itemId[0] : params.itemId
  const pushId = Array.isArray(params.pushId) ? params.pushId[0] : params.pushId
  return <QuickSession key={`${itemId}:${pushId ?? ''}`} itemId={itemId} pushId={pushId} />
}

function QuickSession({ itemId, pushId }: { itemId: string; pushId?: string }) {
  const router = useRouter()
  const { branding } = useSession()
  const { colors, space } = useTheme()
  const [state, setState] = useState<QuickSessionState>({ status: 'loading' })
  const [reporting, setReporting] = useState(false)
  const controller = useRef<ReturnType<typeof createQuickSession> | null>(null)
  const busy = useRef(false)
  const leaving = useRef(false)
  const frameRef = useRef<View>(null)
  const dockRef = useRef<View>(null)
  const reportRef = useRef<View>(null)

  useEffect(() => {
    leaving.current = false
    const session = createQuickSession({
      itemId, pushId, request: api, onChange: setState,
      onReveal: (reveal) => {
        Keyboard.dismiss()
        if (reveal.state === 'ungraded') return
        resultHaptic(reveal.correct ? 'correct' : 'miss')
      },
    })
    controller.current = session
    void session.load()
    return () => {
      session.dispose()
      if (controller.current === session) controller.current = null
    }
  }, [itemId, pushId])

  const backToToday = useCallback(() => {
    if (leaving.current) return
    leaving.current = true
    controller.current?.dispose()
    // dismissTo replaces when Today is absent, including notification cold starts.
    router.dismissTo(TODAY)
  }, [router])

  useFocusEffect(useCallback(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (reporting) return false // The report sheet handles Back first.
      backToToday()
      return true
    })
    return () => back.remove()
  }, [backToToday, reporting]))

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      // SessionFrame has no label override. Its first top-bar control is the
      // shared close button; adapt its native label without copying the frame.
      const close = frameRef.current?.firstElementChild?.firstElementChild?.firstElementChild
      const nativeClose = close as unknown as View | undefined
      nativeClose?.setNativeProps({ accessibilityLabel: 'Close' })
    })
    return () => cancelAnimationFrame(frame)
  }, [state.status])

  const checkError = state.status === 'question' ? state.error : null
  useEffect(() => {
    if (!checkError) return
    const frame = requestAnimationFrame(() => {
      const retry = dockRef.current?.firstElementChild?.lastElementChild
      const tag = retry && findNodeHandle(retry as unknown as View)
      if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag)
    })
    return () => cancelAnimationFrame(frame)
  }, [checkError])

  const check = useCallback(async () => {
    if (busy.current || leaving.current) return
    busy.current = true
    try { await controller.current?.check() }
    finally { busy.current = false }
  }, [])

  function changeDraft(update: Partial<Draft>) {
    const current = controller.current?.getState()
    if (current?.status === 'question') controller.current?.changeDraft({ ...current.draft, ...update })
  }

  function closeReport(sent = false) {
    setReporting(false)
    requestAnimationFrame(() => {
      const link = reportRef.current?.firstElementChild
      const tag = link && findNodeHandle(link as unknown as View)
      if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag)
      if (sent) AccessibilityInfo.announceForAccessibility('Report sent')
    })
  }

  const question = state.status === 'question' || state.status === 'checking' ? state : null
  const item = question?.session.item
  const done = state.status === 'done' ? state : null
  const dockStyle = {
    paddingHorizontal: space[4], paddingTop: space[3], gap: space[3],
    borderTopWidth: 1, borderTopColor: colors.border,
  }

  return (
    <SheetHost sheet={reporting && done?.session.item ? (
      <ReportSheet
        itemId={done.session.item.id}
        attemptId={done.reveal.attemptId}
        branding={branding}
        onBack={() => closeReport()}
        onSent={() => closeReport(true)}
      >
        {(content) => <Sheet {...content} />}
      </ReportSheet>
    ) : null}>
      <View ref={frameRef} collapsable={false} style={{ flex: 1 }}>
        <SessionFrame
          onEnd={backToToday}
          inert={reporting}
          topBar={{ kind: 'label', label: done ? '' : '1 question' }}
          trailing={<ReadAloudButton item={item ?? null} blocked={question?.status === 'checking'} />}
          dock={item && question ? (
            <>
              {question.error ? (
                <View style={{ paddingHorizontal: space[4], paddingBottom: space[3] }}>
                  <AlertRow>{question.error}</AlertRow>
                </View>
              ) : null}
              <View ref={dockRef} collapsable={false}>
                <QuestionDock
                  item={item}
                  answer={question.draft.answer}
                  confidence={question.draft.confidence}
                  onConfidenceChange={(confidence: Confidence) => changeDraft({ confidence })}
                  onSubmit={() => { void check() }}
                  busy={question.status === 'checking'}
                  mode={question.error ? 'retry' : 'check'}
                />
              </View>
            </>
          ) : done ? (
            <QuickDock style={dockStyle}>
              <Button variant="primary" size="lg" onPress={backToToday}>Back to Today</Button>
              <View ref={reportRef} collapsable={false}>
                <LinkButton tone="muted" icon={Flag} onPress={() => setReporting(true)}>Report this question</LinkButton>
              </View>
            </QuickDock>
          ) : state.status !== 'loading' ? (
            <QuickDock style={dockStyle}>
              <Button variant="primary" size="lg" onPress={backToToday}>Back to Today</Button>
            </QuickDock>
          ) : undefined}
        >
          {state.status === 'loading' ? <SessionSkeleton /> : null}
          {item && question ? (
            <QuickQuestion
              item={item}
              answer={question.draft.answer}
              onAnswer={(answer) => changeDraft({ answer })}
              busy={question.status === 'checking'}
              onSubmit={() => { void check() }}
            />
          ) : null}
          {done ? <QuickResult reveal={done.reveal} chosenText={done.chosenText} reviewsLeft={done.reviewsLeft} hasCompany={branding != null} /> : null}
          {state.status === 'error' || state.status === 'unavailable' || state.status === 'answered' ? (
            <QuickFailure key={state.status} status={state.status} onRetry={() => { void controller.current?.load() }} />
          ) : null}
        </SessionFrame>
      </View>
    </SheetHost>
  )
}

function QuickQuestion({ item, answer, onAnswer, busy, onSubmit }: {
  item: ItemView; answer: Answer; onAnswer(answer: Answer): void; busy: boolean; onSubmit(): void
}) {
  const { space } = useTheme()
  const headingRef = useRef<NativeText>(null)
  useHeadingFocus(headingRef)
  return (
    <>
      <View style={{ gap: space[1] }}>
        <Text ref={headingRef} variant="title2" header>{item.stem}</Text>
        {item.format === 'multi' ? <Text variant="caption" muted>{MULTI_CAPTION}</Text> : null}
      </View>
      <QuestionBody item={item} answer={answer} onAnswer={onAnswer} marks={null} disabled={busy} onSubmit={onSubmit} />
    </>
  )
}

function QuickFailure({ status, onRetry }: { status: 'error' | 'unavailable' | 'answered'; onRetry(): void }) {
  const headingRef = useRef<NativeText>(null)
  useHeadingFocus(headingRef)
  return (
    <>
      <Text ref={headingRef} variant="title2" header>
        {status === 'error' ? offlineTitle : status === 'unavailable' ? "This question isn't available any more." : 'You already answered this question.'}
      </Text>
      {status === 'error' ? <><AlertRow>{offlineBody}</AlertRow><Button variant="primary" size="lg" onPress={onRetry}>Try again</Button></> : null}
    </>
  )
}

function QuickDock({ children, style }: { children: ReactNode; style: ViewStyle }) {
  const { space } = useTheme()
  const insets = useSafeAreaInsets()
  return <View style={[style, { paddingBottom: space[3] + Math.max(space[2], insets.bottom) }]}>{children}</View>
}
