import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teach tailwind-merge the token type scale, so text-label is a font size and is not dropped next to a text color.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['display', 'title-1', 'title-2', 'title-3', 'body-lg', 'body', 'label-lg', 'label', 'caption', 'overline', 'chip'],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Same-site path from a URL search param, else undefined: never redirect off-site.
export const sitePath = (v: unknown) => (typeof v === 'string' && /^\/(?![/\\])/.test(v) ? v : undefined)

const pluralRules = new Intl.PluralRules('en-US')

// "1 user", "0 users", "2 users": every visible count label goes through this.
export const plural = (count: number, one: string, other: string) => `${count} ${pluralRules.select(count) === 'one' ? one : other}`
