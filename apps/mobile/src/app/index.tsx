import { Redirect } from 'expo-router'
import { useSession } from '@/lib/session-store'
import { homeTarget } from '@/lib/route-gates'

export default function Screen() {
  const session = useSession()
  if (session.status === 'loading') return null
  return <Redirect href={homeTarget(session)} />
}
