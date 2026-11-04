import { Icon } from '../ui/icon'
import { PhoneFrame } from '../ui/phone-frame'

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
            <picture className="desk block">
              <source
                media="(prefers-color-scheme: dark)"
                srcSet="/screenshots/portal-people-dark.webp 1x, /screenshots/portal-people-dark@2x.webp 2x"
              />
              <img
                src="/screenshots/portal-people.webp"
                srcSet="/screenshots/portal-people.webp 1x, /screenshots/portal-people@2x.webp 2x"
                alt="Northwind Logistics People page: Alex Rivera is invited, Morgan Chen is active at 61% with one open critical error, and Sam Patel is proficient."
                width={1440}
                height={900}
                loading="lazy"
                className="block h-auto w-full"
              />
            </picture>
            <figcaption className="t-caption muted">
              Company portal, People. Northwind Logistics is a demo company; names and numbers are illustrative.
            </figcaption>
          </figure>
          <figure className="mgr-phone">
            <PhoneFrame>
              <picture className="absolute inset-0">
                <source
                  media="(prefers-color-scheme: dark)"
                  srcSet="/screenshots/phone-morgan-progress-dark.webp 1x, /screenshots/phone-morgan-progress-dark@2x.webp 2x"
                />
                <img
                  src="/screenshots/phone-morgan-progress.webp"
                  srcSet="/screenshots/phone-morgan-progress.webp 1x, /screenshots/phone-morgan-progress@2x.webp 2x"
                  alt="Morgan Chen’s Training progress for Warehouse picker, showing mastery bars and benchmark markers on the page shared with Morgan in the app."
                  width={360}
                  height={740}
                  loading="lazy"
                  className="block size-full object-fill"
                />
              </picture>
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
