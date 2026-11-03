// Pure tab-bar logic, kept free of React Native so it can be unit tested.

type TabPressEvent = { type: 'tabPress'; target: string; canPreventDefault: true }

// Path has nothing to show until Today reports a topic.
export function isTabDisabled(routeName: string, today: { topic: unknown | null } | null | undefined): boolean {
  return routeName === 'path' && !today?.topic
}

// React Navigation's tab-press contract: always emit tabPress (a re-tap on the
// focused tab lets screens scroll to top), navigate only when switching tabs
// and no listener prevented it. A disabled tab does nothing.
export function pressTab({
  routeKey,
  focused,
  disabled,
  emit,
  navigate,
}: {
  routeKey: string
  focused: boolean
  disabled: boolean
  emit: (event: TabPressEvent) => { defaultPrevented: boolean }
  navigate: () => void
}): void {
  if (disabled) return
  const event = emit({ type: 'tabPress', target: routeKey, canPreventDefault: true })
  if (!focused && !event.defaultPrevented) navigate()
}
