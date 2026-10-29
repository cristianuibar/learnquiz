import { Link } from '@tanstack/react-router'

export function TopBar() {
  return (
    <header className="mx-auto flex h-16 w-full max-w-3xl items-center px-4">
      <Link
        to="/"
        className="-mx-2 flex h-12 items-center rounded-md px-2 text-lg font-semibold tracking-tight outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        Learn Quiz
      </Link>
    </header>
  )
}
