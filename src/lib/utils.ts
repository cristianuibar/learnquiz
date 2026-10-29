import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Same-site path from a URL search param, else undefined: never redirect off-site.
export const sitePath = (v: unknown) => (typeof v === 'string' && /^\/(?![/\\])/.test(v) ? v : undefined)
