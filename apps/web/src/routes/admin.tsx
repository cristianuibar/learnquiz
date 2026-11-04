import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import { RouteError } from '@/components/inline-error'
import { getStaffSession } from '@/server/admin'

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => ({ staff: await getStaffSession() }),
  errorComponent: RouteError,
  component: () => (
    <div className="mx-auto w-full max-w-[1120px] px-4 pt-8 pb-16">
      <nav aria-label="Staff" className="mb-8 flex flex-wrap items-center gap-6">
        <span className="font-semibold">Staff area</span>
        <Link to="/admin/companies" className="rounded-md px-3 py-3 underline focus-visible:ring-[3px] focus-visible:ring-ring/50" activeProps={{ 'aria-current': 'page', className: 'bg-brand-tint text-ink' }}>Companies</Link>
        <Link to="/admin/jobs" className="rounded-md px-3 py-3 underline focus-visible:ring-[3px] focus-visible:ring-ring/50" activeProps={{ 'aria-current': 'page', className: 'bg-brand-tint text-ink' }}>Generation jobs</Link>
        <Link to="/admin/flags" className="rounded-md px-3 py-3 underline focus-visible:ring-[3px] focus-visible:ring-ring/50" activeProps={{ 'aria-current': 'page', className: 'bg-brand-tint text-ink' }}>Content flags</Link>
        <Link to="/admin/users" search={{ search: '', field: 'email', offset: 0 }} activeOptions={{ includeSearch: false }} className="rounded-md px-3 py-3 underline focus-visible:ring-[3px] focus-visible:ring-ring/50" activeProps={{ 'aria-current': 'page', className: 'bg-brand-tint text-ink' }}>Users</Link>
      </nav>
      <Outlet />
    </div>
  ),
})
