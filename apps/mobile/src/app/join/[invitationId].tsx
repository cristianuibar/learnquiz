import { useEffect, useRef, useState } from 'react'
import { View, type Text as NativeText } from 'react-native'
import { useKeyboardState } from 'react-native-keyboard-controller'
import { useIsFocused, useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { roleHeadline, type InviteView } from '@learnquiz/api/invite'
import { networkError } from '@learnquiz/api/system-copy'
import { AccountForm, type AccountFormValues } from '@/components/account-form'
import { AlertRow } from '@/components/ui/AlertRow'
import { Button } from '@/components/ui/Button'
import { Mark } from '@/components/ui/Mark'
import { OrgLogo } from '@/components/ui/OrgLogo'
import { Screen, useHeadingFocus } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { api, mediaSource } from '@/lib/api'
import { acceptInvitation, signIn, signUp, subscribeAuth } from '@/lib/auth'
import { peekHeldTarget, takeHeldTarget } from '@/lib/held-target'
import { useAttemptHold, useReplayHold } from '@/lib/use-replay-hold'
import {
  createJoinFlow,
  decideJoinNavigation,
  invalidScreen,
  inviteScreen,
  joinFailed,
  loadInvite,
  type AuthMode,
  type InviteLoad,
  type JoinInput,
  type JoinOutcome,
  type Viewer,
} from '@/lib/join'
import { endSession, useSession } from '@/lib/session-store'
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider'

const joinApi = {
  signUp,
  signIn,
  accept: acceptInvitation,
  session: () => api<{ needsDisclosure: boolean }>('/session'),
}

// What an attempt or a sign-out left for the screen to act on while it is focused.
type Pending =
  | { kind: 'outcome'; token: number; outcome: Exclude<JoinOutcome, { kind: 'stale' }> }
  | { kind: 'reset'; error: string | null }

export default function JoinScreen() {
  const { invitationId } = useLocalSearchParams<{ invitationId: string }>()
  const [load, setLoad] = useState<InviteLoad | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let live = true
    setLoad(null)
    void loadInvite(() => api<InviteView | null>(`/invites/${encodeURIComponent(invitationId)}`)).then((result) => {
      if (live) setLoad(result)
    })
    return () => { live = false }
  }, [invitationId, reload])

  return (
    <ThemeProvider accent={load?.kind === 'found' ? load.invite.accent : null}>
      <JoinLayout>
        {!load ? <Skeleton />
          : load.kind === 'failed' ? <LoadFailed message={load.message} onRetry={() => setReload((n) => n + 1)} />
          : load.kind === 'invalid' ? <Heading title={invalidScreen.title} body={invalidScreen.body} />
          : <Invite invitationId={invitationId} invite={load.invite} />}
      </JoinLayout>
    </ThemeProvider>
  )
}

function LoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { space } = useTheme()
  return (
    <View style={{ gap: space[4] }}>
      <AlertRow>{message}</AlertRow>
      <Button size="lg" variant="secondary" onPress={onRetry}>Try again</Button>
    </View>
  )
}

function JoinLayout({ children }: { children: React.ReactNode }) {
  const { space } = useTheme()
  const keyboardVisible = useKeyboardState((state) => state.isVisible)
  return (
    <Screen
      // The artboard pads 32 below a status bar the app does not draw: inset + 16.
      contentContainerStyle={{ paddingTop: space[4] }}
      footer={keyboardVisible ? undefined : <Footer />}
    >
      {children}
    </Screen>
  )
}

function Invite({ invitationId, invite }: { invitationId: string; invite: InviteView }) {
  const { space } = useTheme()
  const session = useSession()
  const router = useRouter()
  const focused = useIsFocused()
  const flow = useRef(createJoinFlow(joinApi, invitationId)).current
  const [mode, setMode] = useState<AuthMode>('signUp')
  const [signInOpen, setSignInOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  // While a submit runs the session changes underneath; keep the screen it started on.
  const [frozen, setFrozen] = useState<{ viewer: Viewer } | null>(null)
  // From each submit while this screen is in front, only the join flow navigates:
  // a session refresh that lands after a failed accept must not replay a held link.
  const holdReplay = useReplayHold()
  // From submit until this screen acts on the result, even under a pushed screen.
  const attemptHold = useAttemptHold()
  // Async work never touches state or the router. It leaves its result here, and
  // the effect below acts on it only while this screen is focused.
  const pending = useRef<Pending | null>(null)
  const attempt = useRef<number | null>(null)
  const focusedRef = useRef(false)
  const [settled, setSettled] = useState(0)

  const user = session.status === 'ready' && session.user && !session.user.isAnonymous ? session.user : null
  const viewer: Viewer = frozen ? frozen.viewer : user && { name: user.name }
  // This flow signs in only with the invite's email, so it is never another account.
  const view = inviteScreen(flow.authenticated ? { ...invite, otherAccount: false } : invite, viewer, roleHeadline(invite.roleName, invite.company))

  useEffect(() => {
    focusedRef.current = focused
    return () => { focusedRef.current = false }
  }, [focused])

  function settle(next: Pending) {
    pending.current = next
    // A blurred or unmounted screen does not re-render for it; focus picks it up.
    if (focusedRef.current) setSettled((n) => n + 1)
  }

  // Sign-out (switch account, or api.ts after a 401) ends the cached sign-in and
  // every attempt in flight; the screen returns to sign-in mode.
  useEffect(() => subscribeAuth((event) => {
    if (event !== 'signedOut') return
    const inFlight = attempt.current !== null && flow.isLive(attempt.current)
    flow.signedOut()
    attempt.current = null
    attemptHold.end()
    busyRef.current = false
    settle({ kind: 'reset', error: inFlight ? joinFailed : null })
  }), [flow, attemptHold])

  // The only place that acts on async results, and the only router call of the flow.
  useEffect(() => {
    const next = pending.current
    if (!focused || !next) return
    const finish = () => {
      pending.current = null
      attempt.current = null
      attemptHold.end()
      busyRef.current = false
      setBusy(false)
      setFrozen(null)
    }
    if (next.kind === 'reset') {
      finish()
      setMode('signIn')
      setError(next.error)
      return
    }
    const { outcome, token } = next
    if (outcome.kind === 'error') {
      if (!flow.isLive(token)) {
        pending.current = null
        if (attempt.current === token) { attempt.current = null; attemptHold.end() }
        return
      }
      finish()
      setError(outcome.message)
      if (outcome.mode) setMode(outcome.mode)
      return
    }
    const decision = decideJoinNavigation(outcome, { live: flow.isLive(token), focused, session, held: peekHeldTarget() })
    if (decision.kind === 'keep') return // the session store catches up and re-runs this
    if (decision.kind === 'drop') {
      pending.current = null
      if (attempt.current === token) { attempt.current = null; attemptHold.end() }
      return
    }
    if (decision.kind === 'offline') { finish(); setError(networkError); return }
    pending.current = null
    // Take the held link while this screen still holds replay, then leave.
    if (decision.takesHeld) takeHeldTarget()
    attemptHold.end()
    router.replace(decision.target as Href)
  }, [focused, settled, session, flow, router, attemptHold])

  function start(): number | null {
    if (busyRef.current) return null
    busyRef.current = true
    holdReplay()
    attemptHold.begin()
    const token = flow.begin()
    attempt.current = token
    setBusy(true)
    setError(null)
    return token
  }

  async function run(input: JoinInput) {
    const token = start()
    if (token === null) return
    setFrozen({ viewer })
    const outcome = await flow.run(input, viewer !== null, token)
    if (outcome.kind === 'stale' || !flow.isLive(token)) return
    if (outcome.kind === 'done') {
      await session.refresh()
      if (!flow.isLive(token)) return
    }
    settle({ kind: 'outcome', token, outcome })
  }

  function continueToToday() {
    const token = start()
    if (token === null) return
    settle({ kind: 'outcome', token, outcome: { kind: 'done', needsDisclosure: session.needsDisclosure } })
  }

  function changeMode(next: AuthMode) {
    setMode(next)
    setError(null)
  }

  function switchAccount() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    // The signedOut event resets this screen into sign-in mode; nothing waits here.
    // endSession() never rejects and signs out even when push unregistration stalls.
    void endSession()
  }

  const { action } = view
  const formOpen = action.kind === 'form' || (action.kind === 'signIn' && signInOpen)
  return (
    <>
      <View style={{ gap: space[4] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <OrgLogo size={56} name={invite.company} source={invite.logoUrl ? mediaSource(invite.logoUrl) : undefined} />
          <Text variant="label" style={{ flexShrink: 1 }}>{invite.company}</Text>
        </View>
        <Heading title={view.title} body={view.body} />
      </View>
      {formOpen ? (
        <AccountForm
          mode={mode}
          onModeChange={changeMode}
          email={invite.email}
          defaultName={invite.name}
          error={error}
          busy={busy}
          onSubmit={(values: AccountFormValues) => run({ ...values, mode, accept: action.kind !== 'signIn' })}
        />
      ) : action.kind !== 'none' && (
        <View style={{ gap: space[4] }}>
          {!!error && <AlertRow>{error}</AlertRow>}
          <Button
            size="lg"
            variant="primary"
            busy={busy}
            onPress={() => {
              if (action.kind === 'join') void run({ mode: 'signIn', email: invite.email, name: '', password: '' })
              else if (action.kind === 'switchAccount') switchAccount()
              else if (action.kind === 'signIn') { changeMode('signIn'); setSignInOpen(true) }
              else if (action.kind === 'today') continueToToday()
            }}
          >
            {action.label}
          </Button>
        </View>
      )}
    </>
  )
}

// Mounted only once the invite resolved, and re-keyed by title, so TalkBack lands on the current heading.
function Heading({ title, body }: { title: string; body: string | null }) {
  return <FocusedHeading key={title} title={title} body={body} />
}

function FocusedHeading({ title, body }: { title: string; body: string | null }) {
  const { space } = useTheme()
  const ref = useRef<NativeText>(null)
  useHeadingFocus(ref)
  return (
    <View style={{ gap: space[2] }}>
      <Text ref={ref} variant="title1" header>{title}</Text>
      {body && <Text>{body}</Text>}
    </View>
  )
}

function Skeleton() {
  const { colors, space, sizes, radius } = useTheme()
  const block = (width: number | `${number}%`, minHeight: number) => (
    <View style={{ width, minHeight, borderRadius: radius.md, backgroundColor: colors.surfaceSunken }} />
  )
  return (
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: space[6] }}>
      <View style={{ gap: space[4] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          {block(sizes.topbarH, sizes.topbarH)}
          {block('40%', space[4] + space[1])}
        </View>
        {block('80%', space[8] + space[1])}
      </View>
      <View style={{ gap: space[4] }}>
        {block('100%', sizes.target)}
        {block('100%', sizes.target)}
        {block('100%', sizes.target)}
        {block('100%', sizes.topbarH)}
      </View>
    </View>
  )
}

function Footer() {
  const { space } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
      <Mark size={space[4] + space[1]} />
      <Text variant="caption" muted>Training by Learn Quiz</Text>
    </View>
  )
}
