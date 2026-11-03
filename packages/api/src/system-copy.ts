export const offlineTitle = 'You’re offline'
export const offlineBody = 'Sessions need a connection.'
export const todayError = 'Couldn’t load today’s plan.'
export const loadingTitle = 'Preparing your session'
export const startFailed = 'Couldn’t prepare your session.'
export const startSlow = 'Taking longer than usual. Still working…'

export function slowAfterMs(start: 'session' | 'placement'): number {
  return start === 'session' ? 15000 : 45000
}

export function checkFailedMessage(saved: boolean, device: 'phone' | 'device'): string {
  return saved
    ? `Couldn’t check your answer. It’s saved on this ${device}.`
    : 'Couldn’t check your answer.'
}

export const networkError = 'Can’t reach Learn Quiz. Check your connection and try again.'
export const saveFailed = 'Couldn’t save. Check your connection and try again.'
export const settingsSaveFailed = 'Couldn’t save your changes. Try again.'
export const reportFailed = 'Couldn’t send your report. Try again.'
