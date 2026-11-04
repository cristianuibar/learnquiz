import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, AppState, findNodeHandle, Linking, Pressable, ScrollView, View, type Text as NativeText } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SheetHost } from '@/components/sheet/sheet-host'
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
import { useHeadingFocus } from '@/components/ui/Screen'
import { Text } from '@/components/ui/Text'
import { api, authCall } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { applyAppearance, persistAppearance, readAppearance, type AppearanceChoice } from '@/lib/appearance'
import { enablePush, pushStatus, type PushState } from '@/lib/push'
import { endSession, useSession } from '@/lib/session-store'
import { createSettingsSave } from '@/lib/settings-save'
import { clampPreferences, deviceTimezone, pushPreferencesBody, questionSwitchOn, settingsTimeOptions, toggleSettingsDay, type PushSettings, type QuestionPreferences } from '@/lib/settings-rules'
import { useTheme } from '@/theme/ThemeProvider'

const appearanceOptions: { value: AppearanceChoice; label: string }[] = [
  { value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' },
]
const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
type Loaded = PushSettings & { owner: string; email: string; native: PushState }

export default function Settings() {
  const { colors, space, sizes } = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const fromField = useRef<View | null>(null)
  const toField = useRef<View | null>(null)
  const returnToField = useRef<{ field: 'from' | 'to'; owner: string | null } | null>(null)
  const viewActive = useRef<() => boolean>(() => false)
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
    // Navigation cancels reads and view updates, never an edit already submitted.
    const sameToken = () => getToken() === token
    const active = () => !controller.signal.aborted && sameToken()
    viewActive.current = active
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
      appearanceQueue.current = createSettingsSave({ initial, isCurrent: sameToken, save: persistAppearance,
        onChange: (value) => { applyAppearance(value); if (active()) setAppearance(value) }, onError: report })
      setAppearanceReady(true)
    })
    void Promise.all([
      api<PushSettings>('/push/settings', { signal: controller.signal }),
      authCall<{ user: { email: string } }>('/get-session', undefined, { signal: controller.signal }),
      pushStatus(),
    ]).then(([settings, auth, native]) => {
      if (!active()) return
      const initial = clampPreferences(settings.prefs, settings.company, deviceTimezone(settings.prefs.timezone))
      setLoaded({ ...settings, prefs: initial, owner: token, email: auth.data.user.email, native })
      prefsQueue.current = createSettingsSave({ initial, isCurrent: sameToken,
        save: (prefs) => api('/push/preferences', { method: 'PUT',
          body: pushPreferencesBody(prefs, settings.company, deviceTimezone(prefs.timezone)) }),
        onChange: (prefs) => { if (active()) setLoaded((previous) => previous?.owner === token ? { ...previous, prefs } : previous) }, onError: report })
    }).catch(() => { if (active()) setLoadFailed(true) })
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void pushStatus().then((native) => {
        if (active()) setLoaded((previous) => previous?.owner === token ? { ...previous, native } : previous)
      })
    })
    return () => {
      controller.abort()
      foreground.remove()
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
        if (viewActive.current()) setLoaded((previous) => previous?.owner === owner ? { ...previous, native } : previous)
        if (!native.registered || native.permission !== 'granted') {
          if (viewActive.current() && native.permission !== 'denied') setSaveFailed(true)
          return
        }
      } finally {
        if (queue.isCurrent()) {
          enableBusy.current = false
          if (viewActive.current()) setEnabling(false)
        }
      }
    }
    // A day or time may have changed during registration. Preserve the latest
    // optimistic snapshot instead of writing the one captured before the await.
    if (queue.isCurrent()) queue.change({ ...queue.value(), paused: false })
  }

  useEffect(() => {
    if (sheet !== null || !returnToField.current) return
    const { field, owner } = returnToField.current
    returnToField.current = null
    const frame = requestAnimationFrame(() => {
      if (!viewActive.current() || getToken() !== owner) return
      const target = field === 'from' ? fromField.current : toField.current
      const tag = target && findNodeHandle(target)
      if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag)
    })
    return () => cancelAnimationFrame(frame)
  }, [sheet])
  const closeSheet = () => {
    if (sheet) returnToField.current = { field: sheet, owner: token }
    setSheet(null)
  }
  const timeSheet = sheet && current ? <TimeSheet label={sheet === 'from' ? 'From' : 'To'} value={sheet === 'from' ? current.prefs.startMinute : current.prefs.endMinute}
    options={settingsTimeOptions(current.company, current.prefs, sheet)} onClose={closeSheet}
    onSelect={(value) => change({ ...current.prefs, ...(sheet === 'from' ? { startMinute: value } : { endMinute: value }) })} /> : null

  return <SheetHost sheet={timeSheet}>
    <View style={{ flex: 1, backgroundColor: colors.surfacePage, paddingLeft: insets.left, paddingRight: insets.right }}>
      <View style={{ paddingTop: insets.top, paddingHorizontal: space[2], minHeight: sizes.topbarH + insets.top, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} />
        <Text ref={heading} header variant="title2" style={{ flex: 1 }}>Settings</Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: space[2], paddingHorizontal: space[4], paddingBottom: space[8] + Math.max(space[2], insets.bottom) }}>
        <View style={{ gap: space[8] }}>
          {saveFailed && <AlertRow>{settingsSaveFailed}</AlertRow>}
          {loadFailed && <View style={{ gap: space[3] }}><AlertRow>Couldn’t load settings.</AlertRow><Button variant="secondary" onPress={() => setAttempt((value) => value + 1)}>Try again</Button></View>}
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
                  <TimeField ref={fromField} label="From" value={formatMinute(current.prefs.startMinute)} onPress={() => setSheet('from')} />
                  <TimeField ref={toField} label="To" value={formatMinute(current.prefs.endMinute)} onPress={() => setSheet('to')} />
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
            {appearanceReady && <Segmented equalWidth value={appearance} options={appearanceOptions} onChange={(value) => { setSaveFailed(false); appearanceQueue.current?.change(value) }} />}
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
      </ScrollView>
    </View>
  </SheetHost>
}
