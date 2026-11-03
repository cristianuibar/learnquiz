import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: () => <h1 className="text-title-1">Learn Quiz</h1>,
})
