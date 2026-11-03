import { Icon } from '../ui/icon'
import { PhoneFrame } from '../ui/phone-frame'

const PORTAL_LABEL =
  'Company portal, Warehouse picker role at Northwind Logistics. Source document Warehouse picker SOPs, version 3. Curriculum of five units: Receiving, Picking, Scanning, Safety, Returns. People: Alex Rivera invited; Morgan Chen onboarding at 66 percent with one confident error on a critical step; Sam Patel proficient at 88 percent.'

const PHONE_LABEL =
  'Morgan Chen’s Training progress page on a phone. Your manager sees this same page. 66 percent of 85 percent benchmark, day 16 of 30, projected Nov 12. By unit: Scanning 74 percent with one confident error on Resolve a scan mismatch, Receiving 82 percent, Picking 68 percent.'

const BENCHMARK = 85

const UNITS = [
  { name: 'Receiving', detail: '6 concepts · 3 critical' },
  { name: 'Picking', detail: '8 concepts' },
  { name: 'Scanning', detail: '5 concepts · 2 critical' },
  { name: 'Safety', detail: '7 concepts · 3 critical' },
  { name: 'Returns', detail: '4 concepts' },
]

const PHONE_UNITS = [
  { name: 'Scanning', mastery: 74, critical: '1 confident error: Resolve a scan mismatch' },
  { name: 'Receiving', mastery: 82 },
  { name: 'Picking', mastery: 68 },
]

function Bar({ value, large, className }: { value: number; large?: boolean; className?: string }) {
  return (
    <span className={['bar', large ? 'bar-lg' : '', className].filter(Boolean).join(' ')}>
      <span className="bar-fill" style={{ width: `${value}%` }} />
      <span className="bar-bench" style={{ left: `${BENCHMARK}%` }} />
    </span>
  )
}

function PortalFrame() {
  return (
    <div className="desk" role="img" aria-label={PORTAL_LABEL}>
      <div className="desk-bar" aria-hidden="true">
        <span className="desk-url">app.learnquiz.com/roles/warehouse-picker</span>
      </div>
      <div className="desk-body" aria-hidden="true">
        <div className="desk-side">
          <span className="flex min-w-0 items-center gap-2">
            <span className="org-logo">NW</span>
            <span className="t-label desk-org-name whitespace-nowrap">Northwind Logistics</span>
          </span>
          <span className="desk-nav">
            <span className="is-on">Roles</span>
            <span>People</span>
            <span>Settings</span>
          </span>
        </div>
        <div className="desk-main">
          <div className="stack gap-1">
            <p className="t-title1">Warehouse picker</p>
            <p className="t-caption muted">Benchmark 85% · 30-day target · Demo company</p>
          </div>
          <div className="desk-cols">
            <div className="card stack gap-2 self-start">
              <p className="t-overline muted">Source</p>
              <span className="flex items-center gap-2">
                <Icon name="doc" className="text-brand" />
                <span className="t-label">Warehouse picker SOPs.pdf</span>
              </span>
              <p className="t-caption muted">v3 · 24 pages · Uploaded Oct 12</p>
            </div>
            <div className="card py-2">
              <p className="t-overline muted pt-2 pb-1">Curriculum · 30 concepts</p>
              {UNITS.map((unit, index) => (
                <div className="unit-row" key={unit.name}>
                  <span className="node">{index + 1}</span>
                  <span>
                    <span className="t-label">{unit.name}</span>
                    <span className="t-caption muted">{unit.detail}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="card stack gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="t-overline muted">People · 3</p>
              <span className="t-label text-brand">Invite</span>
            </div>
            <div className="people">
              <div className="people-head">
                <span>Name</span>
                <span>Status</span>
                <span>Progress</span>
                <span>Note</span>
              </div>
              <div className="people-row">
                <span className="t-label">Alex Rivera</span>
                <span>
                  <span className="chip chip-none">
                    <Icon name="envelope" size={14} />
                    Invited
                  </span>
                </span>
                <span className="people-prog t-caption muted">Not started</span>
                <span className="people-note t-caption muted">Link sent Nov 2</span>
              </div>
              <div className="people-row">
                <span className="t-label">Morgan Chen</span>
                <span>
                  <span className="chip chip-neutral">
                    <Icon name="timer" size={14} />
                    Onboarding
                  </span>
                </span>
                <span className="people-prog">
                  <Bar value={66} className="min-w-12 flex-1" />
                  <span className="t-caption num">66%</span>
                </span>
                <span className="people-note critical-row gap-[6px]">
                  <Icon name="critical" size={16} />
                  1 confident error, critical step
                </span>
              </div>
              <div className="people-row">
                <span className="t-label">Sam Patel</span>
                <span>
                  <span className="chip chip-neutral">
                    <Icon name="target" size={14} className="text-brand" />
                    Proficient
                  </span>
                </span>
                <span className="people-prog">
                  <Bar value={88} className="min-w-12 flex-1" />
                  <span className="t-caption num">88%</span>
                </span>
                <span className="people-note t-caption muted">Reached the benchmark Oct 28</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TrainingProgress() {
  return (
    <>
      <div className="p-scroll gap-[20px] pt-6">
        <div className="stack gap-1">
          <p className="t-title1">Training progress</p>
          <p className="t-body muted">Morgan Chen · Warehouse picker</p>
          <p className="t-caption muted mt-1 flex items-center gap-[6px]">
            <Icon name="eye" size={16} />
            Your manager sees this same page.
          </p>
        </div>
        <div className="card stack gap-3">
          <p className="flex items-baseline gap-2">
            <span className="t-display num">66%</span>
            <span className="t-body muted">of 85% benchmark</span>
          </p>
          <Bar value={66} large />
          <div className="flex justify-between border-t border-border pt-3">
            <span className="t-label">Day 16 of 30</span>
            <span className="t-label">Projected: Nov 12</span>
          </div>
        </div>
        <div className="stack gap-3">
          <p className="text-title-3">By unit</p>
          {PHONE_UNITS.map((unit) => (
            <div className="card stack gap-3" key={unit.name}>
              <div className="flex justify-between">
                <span className="t-label">{unit.name}</span>
                <span className="t-label num">{unit.mastery}%</span>
              </div>
              <Bar value={unit.mastery} />
              {unit.critical ? (
                <span className="critical-row">
                  <Icon name="critical" size={16} />
                  {unit.critical}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div className="p-nav">
        <span>
          <span className="nav-ico">
            <Icon name="home" size={22} />
          </span>
          Today
        </span>
        <span>
          <span className="nav-ico">
            <Icon name="path" size={22} />
          </span>
          Path
        </span>
        <span className="is-on">
          <span className="nav-ico">
            <Icon name="profile" size={22} />
          </span>
          Profile
        </span>
      </div>
    </>
  )
}

export function Managers() {
  return (
    <section aria-labelledby="lqs-mgr" className="section">
      <div className="wrap">
        <div className="push-head">
          <h2 id="lqs-mgr" className="h-section">
            You see who is on track. They see exactly what you see.
          </h2>
        </div>
        <div className="mgr-grid">
          <figure className="stack min-w-0 gap-3">
            <PortalFrame />
            <figcaption className="t-caption muted">
              Company portal. Northwind Logistics is a demo company; names and numbers are illustrative.
            </figcaption>
          </figure>
          <figure className="mgr-phone">
            <PhoneFrame label={PHONE_LABEL}>
              <TrainingProgress />
            </PhoneFrame>
            <figcaption className="same t-body">
              <Icon name="eye" className="mt-px flex-none text-brand" />
              <span>Morgan’s Training progress, on their phone and in the portal alike.</span>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  )
}
