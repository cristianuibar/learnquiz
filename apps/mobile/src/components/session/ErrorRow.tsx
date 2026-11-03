import { AlertRow } from '../ui/AlertRow'

export type ErrorRowProps = { message: string }

export function ErrorRow({ message }: ErrorRowProps) {
  return <AlertRow>{message}</AlertRow>
}
