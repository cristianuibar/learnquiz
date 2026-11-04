import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { ErrorRow } from '@/components/question/error-row'
import { Button } from '@/components/ui/button'
import type { ItemView } from '@learnquiz/api'

export function DiagramImage({ image }: { image: NonNullable<ItemView['image']> }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className="flex flex-col items-start gap-3">
        <ErrorRow message="The diagram could not be loaded." />
        <Button
          type="button"
          variant="secondary"
          onClick={() => setFailed(false)}
        >
          <RotateCcw aria-hidden />
          Retry diagram
        </Button>
      </div>
    )
  }
  return (
    <img
      src={image.src}
      alt={image.alt}
      width={image.width}
      height={image.height}
      onError={() => setFailed(true)}
      // Cap the width so a tall diagram stays within 280px high without letterboxing inside the rim.
      style={{ aspectRatio: `${image.width} / ${image.height}`, maxWidth: `min(100%, ${(280 * image.width) / image.height}px)` }}
      className="max-h-[280px] w-full rounded-md border-[1.5px] border-border-strong bg-white object-contain"
    />
  )
}
