import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { api } from './api'
import { getToken } from './auth'
import { useSession } from './session-store'
import { visibleProcedure, type ProcedureResult } from './procedure'

type Loaded = { token: string; unitId: string; result: ProcedureResult }

// Independent of the path: a missing/failed procedure never blocks Unit.
export function useUnitProcedure(unitId: string | null) {
  const { status } = useSession()
  const token = getToken()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const current = status === 'ready' && token !== null && unitId !== null && loaded?.token === token && loaded.unitId === unitId

  useFocusEffect(useCallback(() => {
    if (status !== 'ready' || !token || !unitId) return
    const controller = new AbortController()
    // Keep this token's loaded content during a refetch, but clear other owners.
    setLoaded((previous) => previous?.token === token && previous.unitId === unitId ? previous : null)
    api<ProcedureResult>(`/units/${encodeURIComponent(unitId)}/procedure`, { signal: controller.signal }).then(
      (result) => {
        if (!controller.signal.aborted && getToken() === token) setLoaded({ token, unitId, result })
      },
      () => { /* Quiet optional content; preserve a previously loaded graph. */ },
    )
    return () => controller.abort()
  }, [status, token, unitId]))

  return current ? visibleProcedure(loaded.result) : null
}
