export type ThemeChoice = 'system' | 'light' | 'dark'

export const themeStorageKey = 'lq-theme'

export const themeBootstrap = `try{var t=localStorage.getItem('${themeStorageKey}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch{}`

export function readTheme(): ThemeChoice {
  try {
    const choice = localStorage.getItem(themeStorageKey)
    if (choice === 'light' || choice === 'dark') return choice
  } catch {}
  return 'system'
}

export function applyTheme(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(themeStorageKey)
    else localStorage.setItem(themeStorageKey, choice)
  } catch {}

  if (choice === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.dataset.theme = choice
}
