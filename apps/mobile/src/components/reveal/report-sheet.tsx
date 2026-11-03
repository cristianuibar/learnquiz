import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Pressable, View, type Text as NativeText } from 'react-native'
import { ChevronLeft } from 'lucide-react-native'
import { reportReasons, type ReportReason } from '@learnquiz/api/reveal'
import { reportFailed } from '@learnquiz/api/system-copy'
import { sendReport } from '../../lib/report'
import { canLeave, canSend, initialSendState, sendBusy, sendFailed, settleSend, startSend, type SendState } from '../../lib/report-send'
import type { Branding } from '../../lib/session-store'
import { useTheme } from '../../theme/ThemeProvider'
import type { SheetProps } from '../sheet/sheet'
import { AlertRow } from '../ui/AlertRow'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { Text } from '../ui/Text'
import { TextField } from '../ui/TextField'

/**
 * Report-this-question sheet content (LearnQuiz #341).
 *
 * Content API, not reveal wiring: it returns Sheet slots for the
 * already-mounted Sheet (no second rise, no scrim, no grabber, no Sheet
 * import). The caller swaps these slots in place of the result sheet.
 *
 * On an existing Sheet:
 * ```tsx
 * const report = useReportSheet({ itemId, attemptId, onBack, onSent, branding })
 * return reporting ? <Sheet {...report} /> : <Sheet band={...} body={...} foot={...} onBack={...} />
 * ```
 *
 * Standalone (caller owns the Sheet):
 * ```tsx
 * <ReportSheet itemId={itemId} attemptId={attemptId} onBack={...} onSent={...} branding={branding}>
 *   {(content) => <Sheet {...content} />}
 * </ReportSheet>
 * ```
 */
export type ReportSheetProps = {
  itemId: string
  attemptId: string | null
  onBack(): void
  onSent(): void
  branding?: Pick<Branding, 'name'> | null
}

export function useReportSheet({ itemId, attemptId, onBack, onSent, branding }: ReportSheetProps): SheetProps {
  const { colors, space, radius, sizes, typography } = useTheme()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [note, setNote] = useState('')
  const [send, setSend] = useState<SendState>(initialSendState)
  const [focusedReason, setFocusedReason] = useState<ReportReason | null>(null)
  const headingRef = useRef<NativeText | null>(null)
  const sendRef = useRef<SendState>(initialSendState)
  const generation = useRef(0)

  const reset = useCallback(() => {
    generation.current += 1
    sendRef.current = initialSendState
    setReason(null)
    setNote('')
    setSend(initialSendState)
    setFocusedReason(null)
  }, [])

  // Invalidate pending sends when the caller changes the question or closes
  // Report. The hook can stay mounted while the same Sheet shows the result.
  useEffect(() => {
    reset()
    return () => { generation.current += 1 }
  }, [itemId, attemptId, reset])

  const handleBack = useCallback(() => {
    if (!canLeave(sendRef.current)) return
    reset()
    onBack()
  }, [onBack, reset])

  const handleSheetBack = useCallback(() => {
    handleBack()
    return true
  }, [handleBack])

  const handleSend = useCallback(() => {
    const started = startSend(sendRef.current, reason)
    if (!started.started || reason === null) return
    const request = ++generation.current
    sendRef.current = started.state
    setSend(started.state)
    const settle = (ok: boolean) => {
      if (request !== generation.current) return
      const settled = settleSend(sendRef.current, ok)
      sendRef.current = settled.state
      setSend(settled.state)
      if (settled.notifySent) onSent()
    }
    void sendReport({ itemId, attemptId, reason, note }).then(
      (ok) => settle(ok),
      () => settle(false),
    )
  }, [itemId, attemptId, reason, note, onSent])

  const radio = space[4] + space[1]
  const dot = space[2] + space[1]

  return {
    grabber: false,
    band: (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1], paddingTop: space[2], paddingRight: space[4], paddingLeft: space[2] }}>
        <IconButton icon={ChevronLeft} accessibilityLabel="Back to result" disabled={!canLeave(send)} onPress={handleBack} />
        <Text ref={headingRef} header variant="title2" nativeID="report-heading" style={{ flex: 1 }}>
          Report this question
        </Text>
      </View>
    ),
    body: (
      <View style={{ gap: space[4], paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[4] }}>
        <View accessibilityRole="radiogroup" accessibilityLabelledBy="report-heading" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
          {reportReasons.map((option, index) => {
            const selected = reason === option.code
            return (
              <Pressable
                key={option.code}
                accessible
                focusable
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => setReason(option.code)}
                onFocus={() => setFocusedReason(option.code)}
                onBlur={() => setFocusedReason(null)}
                style={(state) => ({
                  minHeight: sizes.target,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[3],
                  paddingVertical: space[3],
                  borderBottomWidth: index === reportReasons.length - 1 ? 0 : 1,
                  borderBottomColor: colors.border,
                  backgroundColor: state.pressed ? colors.surfaceSunken : undefined,
                  outlineWidth: focusedReason === option.code ? 2 : 0,
                  outlineOffset: 2,
                  outlineColor: colors.brand,
                })}
              >
                <View
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                  style={{
                    width: radio,
                    height: radio,
                    flexShrink: 0,
                    borderWidth: 2,
                    borderRadius: radius.full,
                    borderColor: selected ? colors.brand : colors.borderStrong,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {selected ? <View style={{ width: dot, height: dot, borderRadius: radius.full, backgroundColor: colors.brand }} /> : null}
                </View>
                <Text style={{ flex: 1 }}>{option.label}</Text>
              </Pressable>
            )
          })}
        </View>
        <TextField
          label="Add a note (optional)"
          multiline
          numberOfLines={2}
          maxLength={300}
          value={note}
          onChangeText={setNote}
          textAlignVertical="top"
          style={{ minHeight: typography.labelLg.lineHeight * 2 + space[3] * 2 + space[1] }}
        />
        {branding ? <Text variant="caption" muted>Goes to {branding.name}’s training team.</Text> : null}
      </View>
    ),
    foot: (
      <>
        {sendFailed(send) ? <AlertRow>{reportFailed}</AlertRow> : null}
        <Button variant="primary" size="lg" disabled={!canSend(send, reason)} busy={sendBusy(send)} onPress={handleSend}>
          Send report
        </Button>
        <Button variant="ghost" disabled={!canLeave(send)} onPress={handleBack}>
          Cancel
        </Button>
      </>
    ),
    onBack: handleSheetBack,
    focusRef: headingRef,
  }
}

export function ReportSheet({ children, ...props }: ReportSheetProps & { children: (content: SheetProps) => ReactNode }) {
  return children(useReportSheet(props))
}
