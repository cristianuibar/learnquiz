import { createElement as h, useRef } from 'react'
import { AccessibilityInfo, BackHandler, StyleSheet, Text } from 'react-native'
import { act, render, screen } from '@testing-library/react-native'
import { setUpTests, useReducedMotion } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { shadows, themes } from '@learnquiz/tokens/native'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { Sheet, type SheetProps } from './sheet'

const Native: typeof import('react-native') = require('react-native')

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: jest.fn() }))
jest.mock('react-native-keyboard-controller', () => ({ KeyboardAvoidingView: require('react-native').View }))
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  __esModule: true,
  useReducedMotion: jest.fn(() => false),
}))

setUpTests()

const WINDOW_HEIGHT = 800
const light = themes.light

function mount(props: Partial<SheetProps> = {}, scheme: 'light' | 'dark' = 'light') {
  return h(ThemeProvider, { scheme, children: h(Sheet, { body: h(Text, null, 'Body'), ...props }) })
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.mocked(useReducedMotion).mockReturnValue(false)
  jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 24, bottom: 0, left: 0, right: 0 })
  jest.spyOn(Native, 'useWindowDimensions').mockReturnValue({ width: 400, height: WINDOW_HEIGHT, scale: 2, fontScale: 1 })
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

type Style = Record<string, any>
type Node = ReturnType<typeof screen.getByText>
function walk(node: Node | string): Node[] {
  return typeof node === 'string' ? [] : [node, ...node.children.flatMap(walk)]
}
function hosts(match: (props: Record<string, any>, style: Style) => boolean) {
  return walk(screen.container as unknown as Node).filter((node) => typeof node.type === 'string' && match(node.props, (StyleSheet.flatten(node.props.style) ?? {}) as Style))
}
const sheetBox = () => hosts((props) => props.accessibilityViewIsModal === true)[0]

test.each(['light', 'dark'] as const)('%s sheet is a raised card anchored under a scrim', async (scheme) => {
  const colors = themes[scheme]
  await render(mount({}, scheme))
  const box = sheetBox()
  expect(box).toHaveStyle({
    backgroundColor: colors.surfaceCard,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    elevation: 8,
    overflow: 'hidden',
    maxHeight: WINDOW_HEIGHT - 24 - 48,
  })
  expect(box).toHaveStyle(shadows[scheme].raised)
  expect(hosts((_, style) => style.backgroundColor === colors.scrim)).toHaveLength(1)
})

test('the scrim is dim, hidden from TalkBack and inert when tapped', async () => {
  await render(mount())
  const [scrim] = hosts((_, style) => style.backgroundColor === light.scrim)
  expect(scrim.props).toMatchObject({ importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true })
  expect(scrim).toHaveStyle({ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 })
  expect(scrim.props.onPress).toBeUndefined()
  expect(scrim.props.onClick).toBeUndefined()
  expect(scrim.props.onStartShouldSetResponder).toBeUndefined()
  expect(scrim.props.onResponderRelease).toBeUndefined()
})

test('the foot sits above the home indicator inset and the body scrolls', async () => {
  await render(mount({ foot: h(Text, null, 'Foot') }))
  const foot = screen.getByText('Foot').parent
  expect(foot).toHaveStyle({ paddingTop: 12, paddingHorizontal: 16, paddingBottom: 12 + 8, gap: 4, borderTopWidth: 1, borderTopColor: light.border, flexShrink: 0 })
  const [body] = hosts((props) => props.persistentScrollbar !== undefined)
  expect(body).toHaveProp('persistentScrollbar', true)
  expect(body).toHaveProp('keyboardShouldPersistTaps', 'handled')
  expect(body).toHaveStyle({ flexShrink: 1, flexGrow: 0 })
})

test('a larger bottom inset pads the foot further', async () => {
  jest.mocked(useSafeAreaInsets).mockReturnValue({ top: 24, bottom: 32, left: 0, right: 0 })
  await render(mount({ foot: h(Text, null, 'Foot') }))
  expect(screen.getByText('Foot').parent).toHaveStyle({ paddingBottom: 12 + 32 })
})

test('band and foot wrappers exist only when provided', async () => {
  const view = await render(mount())
  expect(hosts((_, style) => style.borderTopWidth === 1)).toHaveLength(0)
  await view.rerender(mount({ foot: h(Text, null, 'Foot'), band: h(Text, null, 'Band') }))
  expect(screen.getByText('Band').parent).toHaveStyle({ flexShrink: 0 })
  expect(screen.getByText('Foot')).toBeOnTheScreen()
})

test('the grabber is a decorative 36 x 4 bar TalkBack skips', async () => {
  const view = await render(mount())
  const bars = () => hosts((_, style) => style.height === 4 && style.width === 36)
  expect(bars()).toHaveLength(0)
  await view.rerender(mount({ grabber: true }))
  const [bar] = bars()
  expect(bar.props).toMatchObject({ importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true })
  expect(bar).toHaveStyle({ backgroundColor: light.borderStrong, alignSelf: 'center', marginTop: 8 })
  expect(StyleSheet.flatten(bar.props.style).borderRadius).toBe(9999)
  expect(bar.props.onResponderGrant).toBeUndefined()
})

test('the sheet rises and fades in once over 300 ms', async () => {
  await render(mount({ band: h(Text, null, 'Band') }))
  const box = sheetBox
  expect(box()).toHaveAnimatedStyle({ opacity: 0, transform: [{ translateY: 32 }] })
  await act(() => jest.advanceTimersByTime(150))
  expect(box()).not.toHaveAnimatedStyle({ opacity: 0 })
  expect(box()).not.toHaveAnimatedStyle({ opacity: 1 })
  await act(() => jest.advanceTimersByTime(150))
  expect(box()).toHaveAnimatedStyle({ opacity: 1, transform: [{ translateY: 0 }] })
})

test('reduced motion shows the sheet in place immediately', async () => {
  jest.mocked(useReducedMotion).mockReturnValue(true)
  await render(mount({ band: h(Text, null, 'Band') }))
  expect(sheetBox()).toHaveAnimatedStyle({ opacity: 1, transform: [{ translateY: 0 }] })
})

test('swapping the content does not replay the rise', async () => {
  const view = await render(mount({ band: h(Text, null, 'Band') }))
  await act(() => jest.advanceTimersByTime(300))
  await view.rerender(mount({ band: h(Text, null, 'Report'), body: h(Text, null, 'Other') }))
  expect(screen.getByText('Report').parent?.parent).toHaveAnimatedStyle({ opacity: 1, transform: [{ translateY: 0 }] })
})

describe('hardware Back', () => {
  function capture() {
    const handlers: Array<(...args: never[]) => boolean | null | undefined> = []
    const remove = jest.fn()
    const add = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.push(handler)
      return { remove }
    })
    return { handlers, remove, add }
  }

  test.each([true, false])('returns what onBack returns (%s)', async (result) => {
    const { handlers } = capture()
    const onBack = jest.fn(() => result)
    await render(mount({ onBack }))
    expect(handlers).toHaveLength(1)
    expect((handlers[0] as () => boolean)()).toBe(result)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  test('without onBack Back is left to the system', async () => {
    const { handlers } = capture()
    await render(mount())
    expect((handlers[0] as () => boolean)()).toBe(false)
  })

  test('a new onBack is used without re-registering, and unmounting removes the listener', async () => {
    const { handlers, remove, add } = capture()
    const first = jest.fn(() => false)
    const second = jest.fn(() => true)
    const view = await render(mount({ onBack: first }))
    await view.rerender(mount({ onBack: second }))
    expect(add).toHaveBeenCalledTimes(1)
    expect((handlers[0] as () => boolean)()).toBe(true)
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    await view.unmount()
    expect(remove).toHaveBeenCalledTimes(1)
  })
})

describe('accessibility focus', () => {
  test('focusRef receives focus once after mount', async () => {
    const frames: FrameRequestCallback[] = []
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => frames.push(callback))
    jest.spyOn(Native, 'findNodeHandle').mockReturnValue(42)
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => {})
    const nativeTitle = {} as Text
    function Harness({ label }: { label: string }) {
      const ref = useRef<Text>(nativeTitle)
      return mount({ focusRef: ref, body: h(Text, null, label) })
    }
    const view = await render(h(Harness, { label: 'a' }))
    expect(focus).not.toHaveBeenCalled()
    await act(() => frames.forEach((frame) => frame(0)))
    expect(Native.findNodeHandle).toHaveBeenCalledWith(nativeTitle)
    expect(focus).toHaveBeenCalledWith(42)
    await view.rerender(h(Harness, { label: 'b' }))
    frames.length = 0
    await act(() => frames.forEach((frame) => frame(0)))
    expect(focus).toHaveBeenCalledTimes(1)
  })

  test('unmounting before the frame cancels the focus', async () => {
    jest.spyOn(global, 'requestAnimationFrame').mockReturnValue(7)
    const cancel = jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(() => {})
    const view = await render(mount({ focusRef: { current: null } }))
    await view.unmount()
    expect(cancel).toHaveBeenCalledWith(7)
  })
})
