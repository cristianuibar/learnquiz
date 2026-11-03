const points = [
  ['What the app records', 'Your answers, how sure you were, how long each answer took, and your progress.'],
  ['Who sees it', "You and your company's admins."],
  ['What it is for', 'Your training and development.'],
  ['What is never recorded', 'The app does not read your camera, your sensors or your health data. Voice recordings are not stored.'],
  ['Processors', 'Cloudflare hosts the app. Meta models write questions, grade written answers and transcribe voice answers when you choose to use voice.'],
]

export function LegalNotice({ title }: { title: string }) {
  return (
    <>
      <h1 className="text-title-1">{title}</h1>
      <p className="mt-4 text-ink-muted">Draft notice. This page is not yet the final policy.</p>
      <dl className="mt-8 space-y-6">
        {points.map(([heading, text]) => (
          <div key={heading}>
            <dt className="text-title-2">{heading}</dt>
            <dd className="mt-2">{text}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}
