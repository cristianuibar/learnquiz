import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Ban } from 'lucide-react'
import { ConfirmDialog } from '../../src/components/admin/confirm-dialog'
import '../../src/styles.css'

function Fixture() {
  const [open, setOpen] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  return <>
    <button onClick={() => setOpen(true)}>Retire</button>
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title="Retire Site guide?"
      verb="Retire"
      object="document"
      consequences={Array.from({ length: 20 }, (_, i) => ({
        icon: Ban,
        text: `Concept ${i + 1} is also in Site guide v2. New questions are generated from it and arrive as Unreviewed.`,
      }))}
      onConfirm={() => setConfirmed(true)}
    />
    {confirmed && <p role="status">Document retired</p>}
  </>
}

createRoot(document.getElementById('root')!).render(<Fixture />)
