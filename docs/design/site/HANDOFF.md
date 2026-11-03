# Marketing site: handoff notes

Text of the designer's handoff board (`source/Handoff.dc.html`). The source files are the reference when this text is ambiguous.

One block per home page section, in page order, then the legal pages, share image and favicon. Widths are the page width. Layout values come from site.css; the page breaks at 640 and 1024.

## 1 Header

### Layout

**360**

Mark only (32px). The sign-up button sits right with 12px side padding, then a 48px Menu button. The menu opens a panel under the bar: Sign in and GitHub as 48px rows, 17 / 24 600.

**768**

Wordmark shows beside the mark. Sign in and GitHub link-buttons sit right, then the sign-up button with 16px side padding. No menu button.

**1280**

Same as 768, inside the 1120 content width.

Always 64 tall, sticky at the top, 1px bottom border.

### Components

Skip link (.skip). Logo link: mark SVG plus typeset wordmark. Two link-buttons. Button, secondary or accent (.hdr-cta). Icon button for the menu.

### Motion

The sign-up button swaps quiet and saffron with a 150ms color transition. Instant under reduced motion. The menu opens with no animation.

### Screen reader

First stop: “Skip to content”, visible on focus, linking to main. The header is the banner landmark with nav “Site”. Logo link: “Learn Quiz home”; the wordmark is aria-hidden.

Menu button: “Menu”, with aria-expanded and aria-controls. The open menu is a nav, “Site menu”. Escape closes it and returns focus to the Menu button.

## 2 Hero

### Layout

**360**

One column. h1 40 / 44, lead 17 / 26. Both buttons grow to fill their row and wrap. Phone below at column width, 720 tall. Padding 48 top, 64 bottom.

**768**

h1 48 / 52. Buttons side by side at natural width. Phone 360 × 740, centered below. Padding 64 / 64.

**1280**

Two columns: copy, then the 376 wide phone, gap 64, vertically centered. h1 56 / 60, lead 20 / 30, capped at 34em. Padding 64 / 64.

### Components

.h-hero and .lead. Button accent, large (sign-up link). Button secondary, large, with a play icon and a muted “3 min”; it opens the video dialog. Phone frame with a static question: progress bar, four answer options (one selected), confidence picker on Unsure, Check.

### Motion

None. The video dialog opens without animation.

### Screen reader

Section labelled by the h1. The phone is one image: role=img, “Learn Quiz on a phone. Question 7 of 20 …”. The screen inside is aria-hidden.

“Watch the demo” is a button with aria-haspopup="dialog". The native dialog is modal and labelled by its title. Escape or Close shuts it, and focus returns to the button.

## 3 The problem

### Layout

**360**

Heading and lead, then the founder quote (24 / 32 600) with its caption below. Padding 64 / 64.

**768**

Same stack, wider.

**1280**

Two columns, 6fr and 5fr, gap 64, aligned to the bottom. Quote 28 / 36. Padding 80 / 80.

### Components

.h-section and .lead. Figure with a blockquote (curly quotes come from CSS) and a figcaption: the name in label, the story in muted body.

### Motion

None.

### Screen reader

Region labelled by its h2. The quote is a blockquote in a figure. The caption names Cristian as the founder.

## 4 How it works

### Layout

**360**

Heading, three numbered steps, then the SOP card, a down arrow and the question card in one column.

**768**

Steps first. Below: SOP card, a 40px arrow column pointing right, question card.

**1280**

Two columns, 4fr and 7fr, gap 64. Heading and steps left, the SOP to question figure right.

### Components

Steps with 32px number rings (2px brand). SOP card: skeleton lines and the §3.4 passage on brand-tint. Question card: breadcrumb, Critical chip, four compact answer options (48 tall, 15 / 22), source line “Warehouse picker SOPs v3 · §3.4”. Demo company caption.

### Motion

None.

### Screen reader

An ordered list of three steps, each with an h3. Number rings are aria-hidden; the list gives the count. The arrow reads “becomes”. The sample options are plain list items, not controls.

## 5 The answer moment

### Layout

**360**

DOM and visual order: intro, phone, outcome list. Phone at column width, 700 tall. “Or jump to an outcome”, then four outcome buttons in one column. The section sits on surface-card.

**768**

Same order. Phone 360 × 740, centered. Outcomes in a 2 × 2 grid.

**1280**

Grid areas: intro top left, outcome list (one column) under it, phone on the right spanning both rows. Gaps 32 down, 64 across.

### Components

Live phone: four answer options and three confidence buttons, each a button with role=radio, then Check. Result sheet: scrim, grabber, band with ✓ Correct or ✗ Not quite, +10 XP, Why link-button, source quote (“Warehouse picker SOPs v3 · §3.4”), answer pair, critical row, “Try another answer”.

Outcome toggle buttons: ✓ or ✗ icon, title, description, “Showing” when pressed.

### Motion

The sheet rises once: translateY 32 to 0 with opacity, 300ms ease-out. The Why chevron turns in 150ms. Option borders change in 150ms. Under reduced motion the sheet just appears.

### Screen reader

The phone is a group, “Try a question”. Answers are a radiogroup labelled by the question; confidence is a radiogroup labelled “How sure are you?”. Each group is one Tab stop (roving tabindex). Arrow keys move and select; Space and Enter select. Check is a real disabled button until both are set.

Every new result, from Check or an outcome button, moves focus to the result heading and scrolls it into view. An sr-only sentence completes it, for example “Correct, and you were sure.” Sure and wrong also shows “You were sure, on a critical step.” on screen. The question behind is aria-hidden.

“Try another answer” returns focus to the first answer. Outcome buttons use aria-pressed; pressing the active one resets the demo.

## 6 Questions that come to you

### Layout

**360**

Heading only, no lead. Three screens in a horizontal scroller that snaps to center: 296 columns, phones 280 × 560, radius 36. The row bleeds to the screen edges. Then two facts, stacked.

**768**

Same scroller. Facts in two columns, gap 32.

**1280**

No scrolling. A 3-column grid, gap 32, phones 320 × 580 centered in each column; captions up to 336 wide. Between 1024 and 1119 the frames narrow to fit. Facts in two columns.

### Components

Phone frames: lock screen (os tokens, notification “Your pick slot is empty. What do you do first?”), one-question session, done screen (card and quote “Warehouse picker SOPs v3 · §2.4”). Captions: label h3 and muted text, no numbers. Fact blocks with a top border.

### Motion

None. Scroll snap only.

### Screen reader

An ordered list, “From push to done, three screens”. It takes Tab focus only while it actually scrolls (below 1024), so keyboard users can scroll it. Each phone is role=img with its own sentence. Captions and facts are h3s.

## 7 For managers

### Layout

**360**

Heading only, no lead. Desktop frame at full width: org name hidden, cards and people rows stacked. Caption. Phone at column width, 600 tall, then the “same page” note.

**768**

Desktop frame at full width: org name, two card columns, four-column people table. Phone 360 × 740, centered below.

**1280**

Frame and phone side by side, gap 32. Phone 320 × 660; the frame takes the rest, about 750.

### Components

Desktop frame: browser bar, top bar with org logo and nav, Source card, Curriculum card with path nodes, People card with neutral status chips (envelope, timer, target), mastery bars and benchmark ticks. Phone: Training progress with the display number, large bar, unit cards with Scanning first, critical row, bottom nav on Profile.

### Motion

None.

### Screen reader

Each frame is one role=img. The portal sentence names the role, source, five units and three people with status. The phone sentence states Morgan's progress, Scanning first. Inner content is aria-hidden. Captions read normally.

## 8 Fair by design

### Layout

**360**

Heading. Definition rows, term above text. Never panel. Closing line 24 / 32.

**768**

Terms in a 200 column beside their text.

**1280**

Definition list 7fr, Never panel 5fr, gap 48. Closing line 28 / 36.

### Components

Definition list with top borders. Never panel: surface-sunken, radius-md, padding 24, ban icons in ink. Closing line (.closer).

### Motion

None.

### Screen reader

The dl reads as term and definition pairs. “Never” is an h3 over a list of three. Icons are aria-hidden.

## 9 The learning science

### Layout

**360**

Heading “Built on how memory works.” Chart card at full width, then four claims stacked.

**768**

Same stack, wider chart.

**1280**

Chart 5fr, claims 6fr, gap 64, top-aligned.

### Components

Chart card: title marked “(illustration)”, SVG curve (viewBox 360 wide, 14px labels), key, Replay link-button. Claims: title-2, body-lg, citation (.cite).

### Motion

The reviewed line draws once when half the chart is on screen, if it started below the fold: duration-draw (1200ms) ease-out. Dots fade in over 300ms after it. Replay runs it again. Reduced motion: static, no Replay.

### Screen reader

The chart is role=img with one sentence, starting “Illustrative chart”, comparing both lines. The key is aria-hidden. Replay is a button. Sources are cite elements.

## 10 Meta models and open source

### Layout

**360**

Heading. Model rows, name above description. Then the MIT block.

**768**

Model names in a 160 column beside the description.

**1280**

Model list 7fr, open-source block 4fr, gap 64.

### Components

Model list (dl.models). “MIT licensed” title, then a small Hosted / Local dl (64px term column, no icons). Button secondary, “View on GitHub”, with an arrow icon. Hackathon note in caption.

### Motion

None.

### Screen reader

Both lists read as term and definition pairs. “MIT licensed” is an h3. The GitHub link is named by its text; the arrow is aria-hidden.

## 11 Close and footer

### Layout

**360**

Close: heading at .h-hero size (40 / 44). Buttons fill the row and wrap to full width. Padding 64. Footer: logo, links (44 tall), then copyright and the theme switch, wrapping.

**768**

Heading 48 / 52. The two buttons still share the full row. Footer: logo left, links right; copyright and theme switch on a full-width row below, at either end.

**1280**

Heading 56 / 60. Buttons at natural width. Close padding 80. Footer as at 768.

### Components

Button accent, large (sign-up). Button ghost, large, “Learn on your own”. Logo link. Footer links. Segmented control: System, Light, Dark.

### Motion

Buttons change color in 150ms. The theme changes instantly.

### Screen reader

Close is a region labelled by its h2. The footer is the contentinfo landmark with nav “Footer”. Theme is a group, “Theme”, of three buttons with aria-pressed. System follows prefers-color-scheme.

## /privacy and /terms

### Layout

**360**

Header: mark, then GitHub and Sign in links on the right. No saffron action, no menu button. One text column. Padding 48 top, 64 bottom.

**768**

Header adds the wordmark.

**1280**

Text column capped at 680, left-aligned in the 1120 content width.

### Components

Header with two link-buttons. Article: title-1 h1, “Last updated” caption, h2 20 / 28 600, body 17 / 28, bulleted lists. Placeholder chips (.ph) for missing facts. Footer without the theme switch.

### Motion

None.

### Screen reader

Skip link as on home. An article labelled by the h1, with sections labelled by h2s. The current page's footer link has aria-current="page".

## Share image

### Layout

One size, 1200 × 630, light, 64 margins. Left, 632 wide: mark and wordmark (30 / 36 600), headline 64 / 68 700, line 26 / 36 ink-muted, learnquiz.com 22 / 28. Right: the phone, 64 from the top and right, cropped by the bottom edge.

### Components

Mark, typeset wordmark, phone frame with the scanner question (“Stop the pick” selected, Sure). Source: ShareImage.dc.html. Export as PNG.

### Motion

None.

### Screen reader

Set og:image and twitter:image, with og:image:alt describing the headline and the phone. og:title and og:description use the page title and the hero lead.

## Favicon

### Layout

favicon.svg: the mark on a 24 grid. Ring #0E5A73, #6FC3DC under prefers-color-scheme: dark. Dot #F2A900 in both. Also export favicon-32.png, apple-touch-icon.png (180 × 180, square) and icon-512.png from Favicon.dc.html.

### Components

Mark only. The app icon is the white ring and saffron dot on petrol.

### Motion

None.

### Screen reader

Nothing announced. Link rel="icon" for the SVG and the 32 PNG, rel="apple-touch-icon" for the 180 PNG.

## Placeholders to fill before launch

**GitHub repo URL**

The header, footer, legal header and “View on GitHub” links all point to https://github.com/.

**Demo video**

The dialog shows [DEMO VIDEO EMBED] and [TRANSCRIPT LINK]. Add the embed with captions on, the transcript, and confirm the “3 min” length.

**App sign-up and sign-in URLs**

Assumed: https://app.learnquiz.com/sign-up, /sign-in and /learn. Confirm the real routes.

**og:image URL**

Assumed: https://learnquiz.com/og.png, exported from ShareImage.dc.html.

**Official logo lockup SVG**

The wordmark is typeset in Inter 600 because the outlined learnquiz-lockup.svg was not available. Swap in the lockup in the header, footer and share image.

**Legal text**

/privacy and /terms hold placeholder copy for legal review, with [DATE], [LEGAL ENTITY], [ADDRESS], [CONTACT EMAIL], [RETENTION PERIOD] and [GOVERNING LAW] chips, plus an unwritten limitation of liability clause.

## Production notes

**Breakpoints**

The canvas uses container queries on .site. In production use @media (min-width: 640px) and (min-width: 1024px), and max-width 639.98px for the small-phone rule.

**Fonts**

Self-host Inter (400, 500, 600, 700) or preload it, so the Google Fonts stylesheet does not block first paint.

**Theme default**

Default to System, which follows prefers-color-scheme. The canvas starts on Light only because the artboard has a theme prop.
