import { useId, useRef, useState } from 'react'
import { androidApkUrl, demoTranscriptUrl, demoVideoUrl, signUpUrl } from '../../site-config'
import { Icon } from '../ui/icon'
import { PhoneFrame } from '../ui/phone-frame'
import { Screenshot } from '../ui/screenshot'

const videoTitle = 'Learn Quiz demo, 3 minutes'

function youTubeId(url: URL): string | null {
  const host = url.hostname.replace(/^(www|m)\./, '')
  const segments = url.pathname.split('/').filter(Boolean)
  if (host === 'youtu.be') return segments[0] ?? null
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null
  if (segments[0] === 'embed' || segments[0] === 'shorts' || segments[0] === 'live') return segments[1] ?? null
  if (segments[0] === 'watch') return url.searchParams.get('v')
  return null
}

/** Parses an absolute https URL; anything else (other schemes, relative, garbage) is null. */
function httpsUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/**
 * Turns the configured demo URL into the iframe src, or null when it is not an
 * absolute https URL. YouTube links become a youtube-nocookie.com embed with
 * captions on; any other https URL is used as given.
 */
export function demoEmbedUrl(videoUrl: string): string | null {
  const url = httpsUrl(videoUrl)
  if (!url) return null
  const id = youTubeId(url)
  if (!id) return videoUrl
  const isEmbed = url.pathname.startsWith('/embed/')
  const embed = new URL(`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`)
  if (isEmbed) url.searchParams.forEach((value, key) => embed.searchParams.set(key, value))
  embed.searchParams.set('cc_load_policy', '1')
  return embed.toString()
}

function DemoVideo({ embedUrl, transcriptUrl }: { embedUrl: string; transcriptUrl: string | null }) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  function openVideo() {
    setOpen(true)
    dialogRef.current?.showModal()
  }

  function onClose() {
    setOpen(false)
    buttonRef.current?.focus()
  }

  return (
    <>
      <button
        ref={buttonRef}
        className="btn btn-secondary btn-lg"
        type="button"
        aria-haspopup="dialog"
        onClick={openVideo}
      >
        <Icon name="play" />
        Watch the demo <span className="muted font-medium">3 min</span>
      </button>
      <dialog ref={dialogRef} className="video-dlg" aria-labelledby={titleId} onClose={onClose}>
        <div className="video-head">
          <h2 id={titleId} className="t-title2 flex-1">
            {videoTitle}
          </h2>
          <button className="icon-btn" type="button" aria-label="Close" onClick={() => dialogRef.current?.close()}>
            <Icon name="close" size={24} />
          </button>
        </div>
        <div className="video-frame relative">
          {open ? (
            <iframe
              className="absolute inset-0 size-full border-0"
              src={embedUrl}
              title={videoTitle}
              allow="encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : null}
        </div>
        <p className="video-foot t-caption muted">
          Captions on by default.
          {transcriptUrl ? (
            <>
              {' '}
              <a href={transcriptUrl} target="_blank" rel="noopener noreferrer">
                Transcript
              </a>
            </>
          ) : null}
        </p>
      </dialog>
    </>
  )
}

export function Hero({
  videoUrl = demoVideoUrl,
  transcriptUrl = demoTranscriptUrl,
  apkUrl = androidApkUrl,
}: {
  videoUrl?: string
  transcriptUrl?: string
  apkUrl?: string
}) {
  const embedUrl = demoEmbedUrl(videoUrl)
  const transcriptHref = httpsUrl(transcriptUrl) ? transcriptUrl : null
  return (
    <section className="hero" aria-labelledby="lqs-h1" id="top">
      <div className="wrap">
        <div className="hero-grid">
          <div className="hero-copy">
            <h1 id="lqs-h1" className="h-hero">
              New hires learn the job from your own SOPs.
            </h1>
            <p className="lead max-w-[34em]">
              Upload the procedures for a role. New hires practice them on their phone in five-minute sessions until
              they reach your benchmark. Every explanation quotes your document.
            </p>
            <div className="hero-actions" id="lqs-hero-cta">
              <a className="btn btn-accent btn-lg" href={signUpUrl}>
                Create a company account
              </a>
              {apkUrl ? (
                <a className="btn btn-secondary btn-lg" href={apkUrl}>
                  Get the Android app
                </a>
              ) : null}
              {embedUrl ? <DemoVideo embedUrl={embedUrl} transcriptUrl={transcriptHref} /> : null}
            </div>
          </div>

          <figure className="hero-phone">
            <PhoneFrame>
              <Screenshot
                name="phone-question-confidence"
                alt="Learn Quiz question 1 of 2: Where do you move the tote to start the check? To the assigned checking station and Sure are selected."
                width={360}
                height={740}
                priority
                className="absolute inset-0 size-full object-cover object-top"
              />
            </PhoneFrame>
          </figure>
        </div>
      </div>
    </section>
  )
}
