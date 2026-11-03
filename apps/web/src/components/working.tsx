import { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'

function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// `seconds` is the usual upper bound; past it the wait says so and keeps working.
export function Working({ label, done, seconds }: { label: string; done?: boolean; seconds?: number }) {
  const [elapsed, setElapsed] = useState(0)
  const timed = seconds !== undefined && !done

  useEffect(() => {
    if (!timed) return
    const start = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [timed])

  return (
    <div role="status" className="flex items-center gap-3">
      {done ? (
        <Check className="size-5 text-correct" aria-hidden />
      ) : (
        <Loader2 className="size-5 animate-spin text-learning motion-reduce:animate-none" aria-hidden />
      )}
      <div>
        <p className="font-medium">{label}</p>
        {timed && (
          <p className="text-sm text-muted-foreground">
            {elapsed > seconds ? 'Taking longer than usual. Still working…' : `Usually under ${seconds} s`}
            <span aria-hidden> · {clock(elapsed)} elapsed</span>
          </p>
        )}
      </div>
    </div>
  )
}
