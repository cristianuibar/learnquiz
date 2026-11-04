import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, AppState, Linking, Pressable, View, type Text as NativeText } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import { formatMinute } from '@learnquiz/api/schedule'
import { weekdayLabel } from '@learnquiz/api/settings'
import { possessive } from '@learnquiz/api/invite'
import { settingsSaveFailed } from '@learnquiz/api/system-copy'
import { SettingsSwitch } from '@/components/settings/SettingsSwitch'
import { Segmented, Segment } from '@/components/settings/Segmented'
import { TimeField } from '@/components/settings/TimeField'
import { TimeSheet } from '@/components/settings/TimeSheet'
import { AlertRow } from '@/components/ui/AlertRow'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { LinkButton } from '@/components/ui/LinkButton'
import { Screen, useHeadingFocus } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { api, authCall } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { applyAppearance, persistAppearance, readAppearance, type AppearanceChoice } from '@/lib/appearance'
import { enablePush, pushStatus, type PushState } from '@/lib/push'
import { endSession, useSession } from '@/lib/session-store'
import { createSettingsSave } from '@/lib/settings-save'
import { questionSwitchOn, settingsTimeOptions, toggleSettingsDay, type PushSettings, type QuestionPreferences } from '@/lib/settings-rules'
import { useTheme } from '@/theme/ThemeProvider'

const appearanceOptions: { value: AppearanceChoice; label: string }[] = [
  { value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' },
]
const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
type Loaded = PushSettings & { owner: string; email: string; native: PushState }

export default function Settings() {
  const { colors, space, sizes } = useTheme()
  const router = useRouter()
  const session = useSession()
  const token = getToken()
  const heading = useRef<NativeText | null>(null)
  useHeadingFocus(heading)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [appearance, setAppearance] = useState<AppearanceChoice>('system')
  const [appearanceReady, setAppearanceReady] = useState(false)
  const [sheet, setSheet] = useState<'from' | 'to' | null>(null)
  const [enabling, setEnabling] = useState(false)
  const enableBusy = useRef(false)
  const signOutBusy = useRef(false)
  const [signingOut, setSigningOut] = useState(false)
  const [recordFocused, setRecordFocused] = useState(false)
  const prefsQueue = useRef<ReturnType<typeof createSettingsSave<QuestionPreferences>> | null>(null)
  const appearanceQueue = useRef<ReturnType<typeof createSettingsSave<AppearanceChoice>> | null>(null)
  const current = loaded?.owner === token && session.status === 'ready' ? loaded : null

  useEffect(() => {
    if (!token || session.status !== 'ready') return
    const controller = new AbortController()
    const active = () => !controller.signal.aborted && getToken() === token
    enableBusy.current = false
    setEnabling(false)
    setLoadFailed(false)
    setSaveFailed(false)
    setLoaded(null)
    setSheet(null)
    setAppearanceReady(false)
    const report = () => { if (active()) setSaveFailed(true) }
    void readAppearance().then((initial) => {
      if (!active()) return
      setAppearance(initial)
      appearanceQueue.current = createSettingsSave({ initial, isCurrent: active, save: persistAppearance,
        onChange: (value) => { setAppearance(value); applyAppearance(value) }, onError: report })
      setAppearanceReady(true)
    })
    void Promise.all([
      api<PushSettings>('/push/settings', { signal: controller.signal }),
      authCall<{ user: { email: string } }>('/get-session', undefined, { signal: controller.signal }),
      pushStatus(),
    ]).then(([settings, auth, native]) => {
      if (!active()) return
      setLoaded({ ...settings, owner: token, email: auth.data.user.email, native })
      prefsQueue.current = createSettingsSave({ initial: settings.prefs, isCurrent: active,
        save: (body) => api('/push/preferences', { method: 'PUT', body, signal: controller.signal }),
        onChange: (prefs) => setLoaded((previous) => previous?.owner === token ? { ...previous, prefs } : previous), onError: report })
    }).catch(() => { if (active()) setLoadFailed(true) })
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void pushStatus().then((native) => {
        if (active()) setLoaded((previous) => previous?.owner === token ? { ...previous, native } : previous)
      })
    })
    return () => {
      controller.abort()
      foreground.remove()
      prefsQueue.current?.dispose()
      appearanceQueue.current?.dispose()
      enableBusy.current = false
    }
  }, [token, session.status, attempt])

  const change = (prefs: QuestionPreferences) => {
    if (!current || getToken() !== current.owner) return
    setSaveFailed(false)
    prefsQueue.current?.change(prefs)
  }
  const togglePush = async () => {
    if (!current || enableBusy.current || getToken() !== current.owner) return
    const owner = current.owner
    const queue = prefsQueue.current
    if (!queue?.isCurrent()) return
    if (questionSwitchOn(current.native, current.prefs.paused)) {
      change({ ...current.prefs, paused: true })
      return
    }
    if (!current.native.registered || current.native.permission !== 'granted') {
      enableBusy.current = true
      setEnabling(true)
      setSaveFailed(false)
      try {
        await enablePush()
        const native = await pushStatus()
        if (!queue.isCurrent()) return
        setLoaded((previous) => previous?.owner === owner ? { ...previous, native } : previous)
        if (!native.registered || native.permission !== 'granted') {
          if (native.permission !== 'denied') setSaveFailed(true)
          return
        }
      } finally {
        if (queue.isCurrent()) {
          enableBusy.current = false
          setEnabling(false)
        }
      }
    }
    // A day or time may have changed during registration. Preserve the latest
    // optimistic snapshot instead of writing the one captured before the await.
    if (queue.isCurrent()) queue.change({ ...queue.value(), paused: false })
  }

  return <Screen contentContainerStyle={{ paddingTop: 0, gap: space[2], paddingBottom: space[8] }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: sizes.topbarH, gap: space[2], marginLeft: -space[3] }}>
      <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} />
      <Text ref={heading} header variant="title2">Settings</Text>
    </View>
    <View style={{ gap: space[8] }}>
      {saveFailed && <AlertRow>{settingsSaveFailed}</AlertRow>}
      {loadFailed && <View style={{ gap: space[3] }}><AlertRow>Could not load settings.</AlertRow><Button variant="secondary" onPress={() => setAttempt((value) => value + 1)}>Try again</Button></View>}
      <View style={{ gap: space[3] }}>
        <Text header variant="title3">Learning questions</Text>
        {current ? <>
          <View style={{ gap: space[1] }}>
            <SettingsSwitch checked={questionSwitchOn(current.native, current.prefs.paused)} disabled={enabling} onChange={() => { void togglePush() }} />
            {enabling && <Text muted variant="caption" accessibilityLiveRegion="polite">Enabling notifications…</Text>}
            {current.prefs.paused && <Text muted variant="caption" accessibilityRole="text" accessibilityLiveRegion="polite">Paused. Turn back on any time.</Text>}
            {current.native.permission === 'denied' && <>
              <Text variant="caption" muted>Notifications are off for Learn Quiz in Android settings.</Text>
              <LinkButton onPress={() => { void Linking.openSettings().catch(() => setSaveFailed(true)) }}>Open settings</LinkButton>
            </>}
          </View>
          <View style={{ gap: space[2] }}>
            <Text variant="label">Working hours</Text>
            <View style={{ flexDirection: 'row', gap: space[3] }}>
              <TimeField label="From" value={formatMinute(current.prefs.startMinute)} onPress={() => setSheet('from')} />
              <TimeField label="To" value={formatMinute(current.prefs.endMinute)} onPress={() => setSheet('to')} />
            </View>
            {current.company && <Text variant="caption" muted>Inside {possessive(current.company.name)} hours: {formatMinute(current.company.startMinute)}–{formatMinute(current.company.endMinute)}</Text>}
          </View>
          <View style={{ gap: space[2] }}>
            <Text variant="label">Days</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
              {(current.company?.days ?? [1, 2, 3, 4, 5, 6, 7]).map((day) => <Segment key={day} label={weekdayLabel(day)} accessibilityLabel={dayNames[day - 1]}
                selected={current.prefs.days.includes(day)} onPress={() => {
                  const days = toggleSettingsDay(current.prefs.days, day, current.company?.days ?? [1, 2, 3, 4, 5, 6, 7])
                  if (days) change({ ...current.prefs, days })
                  else AccessibilityInfo.announceForAccessibility('At least one day')
                }} />)}
            </View>
          </View>
        </> : !loadFailed && <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ minHeight: sizes.target * 4, backgroundColor: colors.surfaceSunken }} />}
      </View>
      <View style={{ gap: space[3] }}>
        <Text header variant="title3">Appearance</Text>
        {appearanceReady && <Segmented value={appearance} options={appearanceOptions} onChange={(value) => { setSaveFailed(false); appearanceQueue.current?.change(value) }} />}
      </View>
      <View style={{ gap: space[1] }}>
        <Text header variant="title3">Account</Text>
        {current && <View style={{ minHeight: sizes.topbarH, flexDirection: 'row', alignItems: 'center', gap: space[3], borderBottomWidth: 1, borderColor: colors.border }}>
          <Text variant="bodyLg">Email</Text><Text muted style={{ flex: 1, textAlign: 'right' }}>{current.email}</Text>
        </View>}
        <Pressable accessible focusable accessibilityRole="link" accessibilityLabel="What we record"
          onPress={() => router.push({ pathname: '/welcome', params: { review: '1' } })}
          onFocus={() => setRecordFocused(true)} onBlur={() => setRecordFocused(false)}
          style={({ pressed }) => ({ minHeight: sizes.topbarH, paddingVertical: space[3], flexDirection: 'row', alignItems: 'center', gap: space[3],
            backgroundColor: pressed ? colors.surfaceSunken : 'transparent', outlineWidth: recordFocused ? 2 : 0, outlineOffset: 2, outlineColor: colors.brand })}>
          <Text variant="bodyLg" style={{ flex: 1 }} importantForAccessibility="no">What we record</Text>
          <ChevronRight size={space[6]} color={colors.inkMuted} accessible={false} />
        </Pressable>
        <View style={{ paddingTop: space[3] }}><Button variant="secondary" busy={signingOut} onPress={() => {
          if (signOutBusy.current) return
          signOutBusy.current = true
          setSigningOut(true)
          void endSession().finally(() => { signOutBusy.current = false; setSigningOut(false) })
        }}>Sign out</Button></View>
      </View>
    </View>
    {sheet && current && <TimeSheet label={sheet === 'from' ? 'From' : 'To'} value={sheet === 'from' ? current.prefs.startMinute : current.prefs.endMinute}
      options={settingsTimeOptions(current.company, current.prefs, sheet)} onClose={() => setSheet(null)}
      onSelect={(value) => change({ ...current.prefs, ...(sheet === 'from' ? { startMinute: value } : { endMinute: value }) })} />}
  </Screen>
}
