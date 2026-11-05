import { Icon } from '../ui/icon'
import { PhoneFrame } from '../ui/phone-frame'
import { Screenshot } from '../ui/screenshot'

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
            <Screenshot
              name="portal-people"
              alt="Northwind Logistics People page: Alex Rivera is invited, Morgan Chen is active at 61% with one open critical error, and Sam Patel is proficient."
              width={1440}
              height={900}
              className="h-auto w-full desk"
            />
            <figcaption className="t-caption muted">
              Company portal, People. Northwind Logistics is a demo company; names and numbers are illustrative.
            </figcaption>
          </figure>
          <figure className="mgr-phone">
            <PhoneFrame className="fit-w">
              <Screenshot
                name="phone-morgan-progress"
                alt="Morgan Chen’s Training progress for Warehouse picker, showing mastery bars and benchmark markers on the page shared with Morgan in the app."
                width={360}
                height={740}
                dark={false}
                className="absolute inset-0 size-full object-cover object-top"
              />
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
