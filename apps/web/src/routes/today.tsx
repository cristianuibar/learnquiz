import { useEffect, useId } from 'react'
import { createFileRoute, Link, redirect, useRouter, useRouterState } from '@tanstack/react-router'
import { todayView } from '@learnquiz/api/today'
import { RouteError } from '@/components/inline-error'
import { buttonVariants } from '@/components/ui/button'
import { DoneCard } from '@/components/today/done-card'
import { Hero } from '@/components/today/hero'
import { OfflineNotice, useOnline } from '@/components/today/offline-notice'
import { QuestCard } from '@/components/today/quest-card'
import { RoleCard } from '@/components/today/role-card'
import { TodayBar } from '@/components/today/today-bar'
import { getToday } from '@/server/today'

export const Route = createFileRoute('/today')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/' })
  },
  loader: async () => {
    const today = await getToday()
    if (!today.topic && !today.role) throw redirect({ to: '/start' })
    return today
  },
  errorComponent: RouteError,
  component: Today,
})

type Branding = { name: string; logoUrl: string | null } | null

function Today() {
  const today = Route.useLoaderData()
  const router = useRouter()
  const view = todayView(today, new Date())
  const branding = useRouterState({
    select: (s) => (s.matches[0]?.loaderData as { branding?: Branding } | undefined)?.branding ?? null,
  })
  const org = branding
    ? { name: branding.name, logoUrl: branding.logoUrl }
    : today.role ? { name: today.role.company, logoUrl: null } : null
  const online = useOnline()
  const noticeId = useId()
  const building = view.hero.kind === 'building'

  useEffect(() => {
    if (!building) return
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) void router.invalidate()
    }, 15000)
    return () => clearInterval(timer)
  }, [building, router])

  const topicId = today.topic?.id ?? null
  const placement = today.plan ? today.plan.start === 'placement' : !today.topic?.placed && !!today.topic?.placeable
  const { hero } = view

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-16">
      <TodayBar org={org} streak={view.streak} streakVariant={hero.kind === 'done' ? 'reward' : 'quiet'} />
      <div className="flex flex-col gap-6">
        {!online && <OfflineNotice id={noticeId} />}
        {hero.kind === 'done' ? (
          <DoneCard hero={hero} topicId={topicId} placement={placement} offline={!online} noticeId={noticeId} />
        ) : hero.kind === 'empty' ? null : (
          <Hero hero={hero} topicId={topicId} placement={placement} offline={!online} noticeId={noticeId} />
        )}
        <QuestCard quests={view.quests} />
        {view.role ? (
          <RoleCard role={view.role} />
        ) : (
          <Link to="/start" className={buttonVariants({ variant: 'secondary' })}>Learn something new</Link>
        )}
      </div>
    </main>
  )
}
