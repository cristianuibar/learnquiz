import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, AppState } from 'react-native'
import { Volume2 } from 'lucide-react-native'
import type { ItemView } from '@learnquiz/api'
import { createReadAloud } from '../../lib/session/speech'
import { IconButton } from '../ui/IconButton'

type ReadAloudButtonProps = {
  item: ItemView | null
  itemKey?: string | null
  blocked?: boolean
}

export function ReadAloudButton({ item, itemKey = item?.id ?? null, blocked = false }: ReadAloudButtonProps) {
  const controller = useRef<ReturnType<typeof createReadAloud> | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [screenReader, setScreenReader] = useState<boolean | null>(null)
  const [speechModule, setSpeechModule] = useState<typeof import('expo-speech') | null>(null)
  const [foreground, setForeground] = useState(AppState.currentState === 'active')
  const available = screenReader === false && speechModule !== null

  useEffect(() => {
    if (!speechModule) return
    const speech = createReadAloud(speechModule, setEnabled)
    controller.current = speech
    return () => {
      speech.dispose()
      controller.current = null
    }
  }, [speechModule])

  useEffect(() => {
    let mounted = true
    let readerChanged = false
    const reader = AccessibilityInfo.addEventListener('screenReaderChanged', (value) => {
      readerChanged = true
      setScreenReader(value)
    })
    const app = AppState.addEventListener('change', (value) => setForeground(value === 'active'))
    void AccessibilityInfo.isScreenReaderEnabled().then((value) => {
      if (mounted && !readerChanged) setScreenReader(value)
    }).catch(() => { if (mounted) setScreenReader(true) })
    void import('expo-speech').then(async (speech) => {
      const voices = await speech.getAvailableVoicesAsync()
      if (mounted && voices.length > 0) setSpeechModule(speech)
    }).catch(() => { if (mounted) setSpeechModule(null) })
    return () => {
      mounted = false
      reader.remove()
      app.remove()
    }
  }, [])

  useEffect(() => {
    controller.current?.update({ item, key: itemKey, blocked, available, foreground })
  }, [item, itemKey, blocked, available, foreground, speechModule])

  if (!item || !available) return null
  return (
    <IconButton
      icon={Volume2}
      accessibilityLabel="Read aloud"
      toggle
      checked={enabled}
      disabled={blocked}
      accessibilityState={{ disabled: blocked }}
      onPress={() => controller.current?.toggle()}
    />
  )
}
