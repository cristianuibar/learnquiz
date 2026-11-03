# Marketing site: design-system additions

Text of the design-system additions board (`source/DSAdditions.dc.html`, screenshot `screens/DSAdditions.png`). The source files are the reference when this text is ambiguous.

## Marketing additions to Petrol & Saffron

Everything learnquiz.com adds on top of the system and the learner-app additions. Values are copied from site.css. Anything not listed here is the system as shipped.

## Type

Four new styles. Inter, the same family. Marketing headings step up at each breakpoint through three classes: .h-hero, .h-section and .lead.

| Style | Specimen | Size / line | Weight | Tracking | Used for |
|---|---|---|---|---|---|
| display-lg | New hires learn the job | 48 / 52 | 700 | −0.02em | .h-hero from 640 to 1023: hero h1 and the close h2 |
| display-xl | New hires learn the job | 56 / 60 | 700 | −0.025em | .h-hero at 1024 and up: hero h1 and the close h2 |
| headline | Your SOPs become the training. | 36 / 42 | 700 | −0.015em | .h-section at 1024 and up: every section h2 |
| lead | Upload the procedures for a role. New hires practice them on their phone in five-minute sessions. | 20 / 30 | 400 | 0 | .lead at 1024 and up: hero and section intros |

| Class | Below 640 | 640 to 1023 | 1024 and up |
|---|---|---|---|
| .h-hero | display 40 / 44, 700, −0.02em | display-lg 48 / 52, 700, −0.02em | display-xl 56 / 60, 700, −0.025em |
| .h-section | title-1 28 / 34, 700, −0.01em | title-1 28 / 34, 700, −0.01em | headline 36 / 42, 700, −0.015em |
| .lead | body-lg 17 / 26, 400 | body-lg 17 / 26, 400 | lead 20 / 30, 400 |

### Also in site.css

| Class | Below 1024 | 1024 and up | Note |
|---|---|---|---|
| .founder-quote | 24 / 32, 600, −0.01em | 28 / 36, 600, −0.01em | One-off size, not a token yet |
| .closer | 24 / 32, 700, −0.01em | 28 / 36, 700, −0.01em | One-off size, not a token yet |
| .wordmark | 18 / 24, 600, −0.01em | Same | Typeset stand-in for the outlined lockup |
| .legal p, li | 17 / 28, 400 | Same | body-lg size with a taller line for long reading |

## Spacing and layout

Two spacing steps above space-12, plus page constants. Breakpoints are container queries on the page root (.site). In production use @media at the same values.

| Token | Value | Use |
|---|---|---|
| space-16 | 64px | Hero padding (bottom below 640, top and bottom from 640). Close padding below 1024. Two-column gaps at 1024 and up: hero, problem, how it works, science, models, answer moment (column gap). |
| space-20 | 80px | .section and .close vertical padding at 1024 and up. |
| section-y | 64px → 80px at 1024 | .section uses section-y (64) below 1024. At 1024 and up the rule switches to space-20 (80). .close uses space-16, then space-20. |
| hero padding | 48 / 64 → 64 / 64 at 640 | Top / bottom. space-12 and space-16 below 640, space-16 both ways from 640 up. No change at 1024. |
| gutter | 16px → 32px at 640 | .wrap side padding. Set on .wrap at 640. The push scroller bleeds out by one gutter on each side. |
| content-max | 1120px | .wrap max-width is content-max + 2 × gutter, so 1184px from 640. Content never runs wider than 1120. |
| header-h | 64px | Header bar height. Also the top inset (−64px rootMargin) for the header button swap. |
| breakpoint-md | 640px | @container site (min-width: 640px). Production: @media (min-width: 640px). |
| breakpoint-lg | 1024px | @container site (min-width: 1024px). Production: @media (min-width: 1024px). |
| small phones | max-width 639.98px | Hero, demo and manager phones grow to the column width. |

## Device frames

A phone frame for the app screens and a desktop frame for the company portal. Both draw real system components inside.

| Phone frame | Value |
|---|---|
| phone-w × phone-h | 360 × 740 screen, the app's artboard size. Default everywhere unless listed below. |
| phone-bezel | 8px padding around the screen. Outer width 376px, max-width 100%. |
| phone-radius | 44px outer. Screen radius is phone-radius − phone-bezel, so 36px. |
| Edge | 1px outline in device-edge, offset −1px. No shadow. |
| Screen | surface-page ground, overflow hidden. The lock screen uses the os tokens (.os). |
| .phone-sm | 320 × 660, radius 40. Compact class, not used in the home page markup. |
| Manager phone, 1024 and up | 320 × 660, radius 40. |
| Push phones, below 1024 | 280 × 560, radius 36, in a 296px scroller column. |
| Push phones, 1024 and up | 320 × 580, radius 40, in a 3-column grid (gap 32). max-width 100% lets the frame narrow when a column is under 336. |
| Below 640 | Hero, demo and manager phones take the column width (100cqi − 2 × gutter − 2 × bezel), radius 36. Heights: hero 720, demo 700, manager 600. |

Screen 360 × 740. Bezel 8 · outer radius 44 · screen radius 36. Live .phone at the default size.

| Token | Light | Dark | Use |
|---|---|---|---|
| device-bezel | #14181F | #0D0F11 | Phone body around the screen |
| device-edge | #14181F | #6B7380 | 1px edge, so the phone keeps its outline on a dark page |

| Desktop frame | Value |
|---|---|
| Frame | 1px border, radius-lg (16), surface-page, overflow hidden. Its own container (desk), so it reflows by frame width, not page width. |
| Browser bar | 40px tall, surface-sunken, 1px bottom border. URL pill: radius-full, max 360 wide, centered, surface-card with 1px border, 12 / 18 ink-muted, ellipsis. |
| Portal nav | The portal sidebar is drawn as a top bar (.desk-side) at every frame width: org logo 32 × 32, then nav pills (min-height 36, 14 / 20 600, active = brand-tint with ink). |
| Frame ≥ 440 | The org name appears beside the logo. |
| Frame ≥ 600 | Main padding 16 → 24, gap 16 → 24. Source and curriculum cards sit in two columns. The people list becomes a table. |
| Org logo | 32 × 32, radius-md, 13px 700. Light: #14181F ground, #F7F6F2 letters. Dark: #ECEEF1 ground, #14181F letters. Stands in for a customer logo. |

## People list in the portal

Stacked rows in a narrow frame, a four-column table from a 600px frame. Both specimens below are live .desk frames.

| Part | Value |
|---|---|
| Frame below 600 | Each row is a grid: name, then the status chip on the right. Progress and note span the full row below. No head row. |
| Frame 600 and up | Head row shows. Columns 128px / 136px / 1fr / 1.3fr: Name, Status, Progress, Note. Gap 12. |
| Row | Padding 12 / 0, 1px top border, 14 / 20. |
| Head | 12 / 16, 600, 0.02em, ink-muted. |
| Progress | System bar: 8px track, brand fill, 2px ink benchmark tick. The value is printed as text in tabular numbers. |
| Status chips | Neutral icons, 14px, never feedback colors: Invited = envelope (chip-none), Onboarding = timer (chip-neutral), Proficient = target in brand (chip-neutral). The word is always printed. |

Frame 400 wide: org name hidden, rows stacked.

- app.learnquiz.com/roles/warehouse-picker
- NW · Roles · People · Settings
- People · 2
- Morgan Chen · Onboarding · 66% · 1 confident error, critical step
- Sam Patel · Proficient · 88% · Reached the benchmark Oct 28

Frame 720 wide: org name shown, four-column table.

- app.learnquiz.com/roles/warehouse-picker
- NW · Northwind Logistics · Roles · People · Settings
- People · 2
- Name · Status · Progress · Note
- Morgan Chen · Onboarding · 66% · 1 confident error, critical step
- Sam Patel · Proficient · 88% · Reached the benchmark Oct 28

## Citation

The source line under each learning-science claim.

| .cite | Value |
|---|---|
| Element | A cite element under the claim's body text. |
| Type | 13 / 18, 500, ink-muted, font-style normal (caption). |
| Journal | In an i element, italic. |
| Pattern | Authors, year, Journal. Two sources are joined with “ · ”. |
| Spacing | 8px below the body text (claim gap, space-2). |
| SOP quotes | Not .cite. Product quotes keep the system source line and always read “Warehouse picker SOPs v3 · §x”. |

Specimen:

**Trying to recall beats rereading.**

Pulling an answer from memory makes it last longer than reading the page again.

Roediger & Karpicke, 2006, Psychological Science · Dunlosky et al., 2013, Psychological Science in the Public Interest

## Model list

A definition list: model name, then what it does.

| dl.models | Value |
|---|---|
| Row | A div per model. Padding 16 / 0, 1px top border; the last row also has a bottom border. |
| dt | 17 / 24, 700, ink. |
| dd | 15 / 22, 400, ink. |
| Below 640 | Name above description, gap 4. |
| 640 and up | 160px name column, description beside it, gap 24. |
| dl.oss-list | The small Hosted / Local list beside it: 64px term column (label), 15 / 22 text, gap 12, rows 12 apart. No icons. |

Live row at 640 and up, and live row below 640:

**Muse Spark**

Writes the curriculum and questions from your SOPs, checks each one against the source, and grades written answers.

## Forgetting-curve chart

Follows the weekly trend chart rules: lines in brand and ink-muted, dashes carry the difference, never saffron.

| Mark | Value |
|---|---|
| Reviewed line | 2.5px, brand, solid, round caps and joins. |
| Read-once line | 2px, ink-muted, dash 6 / 6, round caps. |
| Review dots | r 5, brand fill, on days 1, 3 and 7. |
| Axis | Baseline 1px border-strong. Top gridline 1px border. |
| Labels | 14px, 500, ink-muted, Inter (at viewBox scale). Key: 24 × 8 line samples, 13 / 18 500 ink-muted. |
| Frame | Card: surface-card, 1px border, radius-md, padding 16, gap 12. viewBox 0 −22 360 248, width 100%. Plot from x 32 to 352. |
| Saffron | Never. |
| duration-draw | 1200ms. New motion token, used only for this draw. |
| Draw-in | Once, when half the figure is on screen, and only if it started below the fold. Reviewed line: stroke-dashoffset 1200 → 0 over duration-draw, ease-out. Dots fade in over duration-reveal (300ms) after a duration-draw delay. A Replay link-button runs it again. |
| Reduced motion | Drawn static. No Replay button. |
| Accessibility | The svg is role=img with one sentence that states both lines. The key is aria-hidden. |

Specimen: One procedure, two ways to learn it (illustration). Axis: 0, 1, 3, 7, 14 days. Lines: Recall, Reviewed on days 1, 3 and 7, Read once.

## Header behavior

Saffron marks one action per view. The header's sign-up button stays quiet while another saffron button is on screen.

| Part | Value |
|---|---|
| Bar | position sticky, top 0, z-index 20. surface-page, 1px bottom border, header-h 64. |
| Quiet | Button secondary while the hero or close “Create a company account” button is on screen. This is the state on load. |
| Saffron | Button accent once neither of those buttons is on screen. |
| Detection | IntersectionObserver on #lqs-hero-cta and #lqs-close-cta, rootMargin −64px at the top, so a button under the header counts as hidden. |
| Transition | Background, color and border, 150ms ease-out (duration-fast). 0ms under reduced motion. |
| Legal pages | No saffron action and no menu button. GitHub and Sign in links show at every width. |

- Quiet: the hero or close button is on screen. Learn Quiz · Sign in · GitHub · Create a company account
- Saffron: both are off screen. Learn Quiz · Sign in · GitHub · Create a company account

## Skip link

The first tab stop on every page. Hidden until focused, then a visible chip over the header.

| .skip | Value |
|---|---|
| Position | Absolute, left 16 (space-4), top 8 (space-2), z-index 40, above the sticky header (20). |
| Hidden | translateY(−200%) until focused. On focus, transform none. |
| Look | min-height 44, padding 0 16, radius-md, brand fill, on-brand text, 14 / 20 600, no underline. |
| Target | href="#main", the main landmark. |

Live .skip in its focused state: Skip to content

## Video dialog

“Watch the demo” opens a native dialog with showModal. Escape and the Close button close it, and focus returns to the button.

| .video-dlg | Value |
|---|---|
| Dialog | width min(880px, 100vw − 32px), no padding, no border, radius-lg, surface-card, shadow-raised. |
| Backdrop | scrim token (light #14181F at 48%, dark #000 at 60%). |
| Head | Title in title-2, 48px Close icon button. Padding 8 8 8 24, 1px bottom border. |
| Frame | 16 : 9, surface-sunken, ink-muted, centered, padding 24. Holds the embed. |
| Foot | Padding 16 / 24, caption: captions note and transcript link. |
| Accessibility | aria-labelledby the title. The opener has aria-haspopup="dialog". |

Live .video-dlg parts, drawn in place without the backdrop:

**Learn Quiz demo, 3 minutes**

[DEMO VIDEO EMBED]

Captions on by default. [TRANSCRIPT LINK]

## Never rules kept

The marketing site adds no exceptions to the system's rules.

| Rule | How the site keeps it |
|---|---|
| No gradients | Flat fills only. Device frames are a solid bezel color. |
| No shadows on cards | Cards, the desktop frame and phones use a 1px border or outline. shadow-raised appears only on things that float: the demo's result sheet and the video dialog. |
| Saffron is never text or lines | Saffron appears only as a button fill and as the logo's dot. Chart lines use brand and ink-muted. |
| One saffron button per view | Hero and close buttons are saffron. The header button stays quiet while either is on screen. |
| Feedback colors only in the answer section | Green and red appear only in section 5: the outcome icons, the demo's answer states and the result band. Critical markers stay in ink. |
