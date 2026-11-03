import { useEffect, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { errorMessage } from '@/components/inline-error'
import { Button } from '@/components/ui/button'
import { generateConceptDiagram, type DiagramResult } from '@/server/diagrams'

export function ConceptDiagram({ conceptId }: { conceptId: string }) {
  const generate = useServerFn(generateConceptDiagram)
  const [result, setResult] = useState<DiagramResult | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setResult(null)
    setError('')
    generate({ data: { conceptId } }).then(
      (value) => { if (active) setResult(value) },
      (err: unknown) => { if (active) setError(errorMessage(err, 'The diagram could not be loaded.')) },
    )
    return () => { active = false }
  }, [conceptId, generate, retry])

  if (result?.status === 'disabled') return null
  if (result?.status === 'unavailable') return <p role="status" className="mt-4 text-sm text-muted-foreground">No diagram yet.</p>
  return (
    <div className="mt-4">
      {result?.status === 'ready' ? (
        <img src={result.image.src} alt={result.image.alt} width={1024} height={1024}
          className="h-auto w-full rounded-md border bg-white" onError={() => setError('The diagram could not be loaded.')} />
      ) : !error && <p role="status" className="text-sm text-muted-foreground">{result?.status === 'pending' ? 'The diagram is being prepared.' : 'Preparing diagram…'}</p>}
      {error && <p role="alert" className="text-sm text-wrong">{error}</p>}
      {(error || result?.status === 'pending') && (
        <Button variant="outline" className="mt-2 min-h-12" onClick={() => setRetry((n) => n + 1)}>Retry diagram</Button>
      )}
    </div>
  )
}
