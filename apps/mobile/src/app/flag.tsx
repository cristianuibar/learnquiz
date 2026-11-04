import { useCallback, useRef, useState } from 'react'
import { AccessibilityInfo, View, type Text as NativeText } from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { AlertRow } from '@/components/ui/AlertRow'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Screen, useHeadingFocus } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { TextField } from '@/components/ui/TextField'
import { api } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { flagNoteValid, resultFlagBody, resultFlagOutcome } from '@/lib/result-flag'
import { useSession } from '@/lib/session-store'
import { useTheme } from '@/theme/ThemeProvider'

export default function Flag() {
  const { conceptId } = useLocalSearchParams<{ conceptId?: string | string[] }>()
  const { status } = useSession()
  const token = getToken()
  if (status !== 'ready' || !token) return null
  const id = typeof conceptId === 'string' ? conceptId : undefined
  // A new session must never inherit another learner's private note or request.
  return <FlagForm key={`${token}:${id}`} token={token} conceptId={id} />
}

function FlagForm({ token, conceptId }: { token: string; conceptId: string | undefined }) {
  const router = useRouter()
  const { space, sizes } = useTheme()
  const headingRef = useRef<NativeText | null>(null)
  useHeadingFocus(headingRef)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef<AbortController | null>(null)
  const focused = useRef(false)
  useFocusEffect(useCallback(() => {
    focused.current = true
    setBusy(false)
    return () => {
      focused.current = false
      pending.current?.abort()
      pending.current = null
    }
  }, []))

  const send = async () => {
    const body = resultFlagBody(conceptId, note)
    if (!body || pending.current || !focused.current || getToken() !== token) return
    const controller = new AbortController()
    // Synchronous guard also catches a second tap before React renders busy.
    pending.current = controller
    setBusy(true)
    setError(null)
    const current = () => !controller.signal.aborted && focused.current && getToken() === token
    const result = await api<unknown>('/me/result-flags', { method: 'POST', body, signal: controller.signal })
      .then((response) => ({ response }), (error: unknown) => ({ error }))
    const outcome = resultFlagOutcome(result, current())
    if (outcome.kind === 'ignore') return
    if (outcome.kind === 'sent') {
      router.dismissTo('/(tabs)/profile')
      AccessibilityInfo.announceForAccessibility('Flag sent')
    } else {
      pending.current = null
      setBusy(false)
      setError(outcome.message)
    }
  }

  const validConcept = !!conceptId?.trim()
  return (
    <Screen contentContainerStyle={{ paddingTop: space[2] }} dock={
      <Button size="lg" disabled={!validConcept || !flagNoteValid(note)} busy={busy} onPress={() => { void send() }}>Send</Button>
    }>
      <View style={{ minHeight: sizes.topbarH, justifyContent: 'center' }}>
        <IconButton icon={ArrowLeft} accessibilityLabel="Back" onPress={() => router.back()} />
      </View>
      <Text ref={headingRef} header variant="title1">Flag an unfair result</Text>
      <Text>Tell your training team what looks wrong. A person reviews every flag.</Text>
      {!validConcept && <AlertRow>Open a result from Training progress to flag it.</AlertRow>}
      <TextField label="Note" multiline maxLength={500} value={note} onChangeText={setNote}
        editable={!busy} textAlignVertical="top" style={{ minHeight: sizes.target * 3 }} />
      {error && <AlertRow>{error}</AlertRow>}
    </Screen>
  )
}
