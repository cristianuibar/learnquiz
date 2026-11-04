# Learner app: handoff notes

Text of the designer's handoff board (`source/Handoff.dc.html`) and the design-system additions board (`source/DSAdditions.dc.html`, screenshot `screens/DSAdditions.png`). The source files are the reference when this text is ambiguous.

## Handoff notes

Handoff notes

Learn Quiz learner app. One section per screen, in flow order. Each heading links to its artboard.

Prototype: the light artboards are the clickable flow. Dark and variant artboards are the same files rendered with theme / state / variant / scroll props.

Basics
Target

Android Chrome PWA now (installable, Web Push). Expo (React Native) later: keep push, haptics, speech and viewport calls behind small adapters so screens port unchanged.

Base frame

360 × 740 portrait, 16 px gutters. Also checked at 390 × 844 (Today390). Shell: .topbar 56 → .scroll (flex 1) → .dock → .nav 64 (Today, Path, Profile only; never during a session).

Tokens

lq.css on top of the Learn Quiz tokens (Petrol & Saffron). Dark by data-theme="dark", tokens only. White-label by data-brand: only --brand, --brand-hover, --on-brand, --brand-tint change. Rules marked ADDITION are proposed DS additions.

Routes in spec

/ Today · /play session (Loading, questions, Reveal, Report and Summary live inside it) · /play/quick/:itemId quick session from a push · /me/profile Training progress. /org/:slug (admin) is not in scope. Screens without a spec route say so.

Global rules
One saffron element per screen: the key action (btn-accent) or the reward (streak, xp). If a saffron button is on screen the streak is streak streak-quiet.
Feedback never by color alone: icon + word ("Correct", "Not quite", "Still learning", "Mastered", "Not started"). --feedback-* only for answer feedback and mastery status. Never for errors; the critical marker (chip-critical) is neutral.
Critical is never shown before answering (it would give the answer away). It appears on the reveal, in Unit, Path and Training progress only.
Chips mark exceptions only. "In progress" is the default and carries no chip; status records that are not mastery states use chip-neutral.
Targets ≥ 48 px (--target): icon-btn 48 × 48, link-btn 48 high, opt 56, btn-lg 56.
Focus ring 2 px --brand, offset 2 px (.lq :focus-visible). On the petrol lead card (Today, light) the ring is --on-brand.
Focus on route change moves to the screen’s h1 (tabindex="-1"), exceptions noted. Sheets take focus to their heading, trap it, and return it to the opener on close.
Reduced motion: prefers-reduced-motion: reduce drops the sheet rise and .pop-in. Nothing loops. No spinners: a determinate bar or a static skeleton plus a status line.
Safe areas: viewport-fit=cover; set --safe-top: env(safe-area-inset-top) and --safe-bottom: max(8px, env(safe-area-inset-bottom)). Consumed by .topbar, .dock, .sheet-foot, .nav.
Keyboard: content scrolls and the dock sits above the keyboard. Viewport meta interactive-widget=resizes-content; fallback via the VisualViewport API (on resize, pad the shell by innerHeight − visualViewport.height). Focused fields scrollIntoView({block: "nearest"}).
Announcements: results role="status" / aria-live="polite"; blocking errors role="alert". One announcement per action.
Disabled-until-ready actions are a real <button disabled> that becomes enabled in place; focus never jumps when it enables. Disabled style: sunken fill, 2 px dashed --border-strong outline, muted ink, so it stays visible in dark mode.
Haptics, proposal only (not agreed; web = navigator.vibrate, Android only): result-correct 15 ms, result-miss 20-60-20 ms, record 10 ms. Never the only signal; nothing else vibrates. Every "Haptics" line below refers to this proposal.
1 · Join by invite

Route: not in spec (invite link) · Main

Layout
No top bar. Scroll padding 32 / 16 / 16, gap 24.
Org row: logo tile 56 + "Northwind Logistics" (label), gap 12. Then h1 "Train as a warehouse picker" (title-1). Block gap 16.
Form: Email (read-only, lock), Your name, Create a password (eye toggle, "At least 8 characters"), Create account.
"or" divider, Continue with Facebook, "I already have an account".
Footer: Learn Quiz mark 20 + "Training by Learn Quiz", bottom padding 12 + --safe-bottom.
Components

org-logo org-logo-lg, field / field-label / input / input-wrap / input-icon, icon-btn, btn-primary btn-lg btn-block, btn-secondary, link-btn, divider. No saffron (the mark’s dot is the logo).

Interaction
Email comes from the invite token; readonly, described by sr-only "Set by your invite".
Create account is disabled until the password has 8 characters, then → Disclosure.
Eye button toggles type password/text, aria-pressed, label "Show password". Password rule is aria-describedby.
Facebook and "I already have an account" → Disclosure in the prototype (real: OAuth, sign-in).
Focus: h1. Do not autofocus a field; the keyboard would cover the invite.
Server errors go under the field as role="alert" (not drawn). Haptics: none.
2 · First sign-in disclosure

Route: not in spec · Disclosure

Layout
Scroll padding 48 / 16 / 16. h1 "Before you start".
Three text blocks, no icons, gap 24; each a label heading + body (gap 4): What we record, Who sees it, What it’s for.
What we record: "Your answers, how sure you were, how long you took, your progress, and anything you type in a reflection or a report note." Reflections and report notes are stored, and company admins see report notes.
Sunken block "Never recorded", padding 16, lock icon (the only icon on the screen): "Camera, location, sensors or health data. The microphone only while you record a voice answer."
"Read the full privacy notice" link (external URL). Dock: Got it.
Components

t-title1, t-label, t-body, sunken, link-btn, dock, btn-primary btn-lg btn-block.

Interaction
Got it stores the acknowledgement (disclosure version + timestamp) and → / in its first-day state. Shown again only when the version changes.
Also opened from Settings › What we record; in the build Got it then returns to Settings.
Focus: h1. No live regions. Haptics: none.
3 · Today

Route: / · Today, TodayFirst, TodayBasics, TodayDone, TodayGenerating, TodayOffline, TodayPlum, Today390

States: normal · first (day 1) · basics (after a level drop) · done · generating (content still building) · offline.

Layout
Top bar 56: logo tile 32 + org name; streak pill right; sr-only h1 "Today".
Lead card (petrol hero), padding 24 / 16 / 16, gap 32: title-2 ("4 reviews, then Picking"), meta "20 questions", Play · 5 min (56). The button carries the duration; the meta never repeats it.
Daily quest: section title + card of rows ("Clear your reviews" "2 of 6", done "6 of 6"; "One session"). Marks are 20 px status circles: not done = the DS not-started dotted circle, done = brand-tint disc with check.
Role card (whole card is a link): "Warehouse picker" + chevron, bar with benchmark tick at 85%, "66% of 85% benchmark", "Day 16 of 30".
Bottom nav, Today current.
Components

topbar, org-logo, streak / streak-quiet / pop-in, card, btn-accent, btn-secondary, section-title, rows / row, bar / bar-fill / bar-bench, chip-none, sunken, nav.

Lead card ground: light = --brand with --on-brand text; dark = --brand-tint with --ink (saffron has no edge on dark-mode cyan).

Interaction
Play → /play (Loading, then question 1). Role card → /me/profile.
normal / first / basics / generating: the petrol hero; Play is the saffron element, streak quiet. First: "Your first session", "Starts with Receiving", "Play · 5 min", no streak, quest shows "One session" only (nothing to review on day 1), role chip "Not started", "Day 1 of 30".
basics: after a level drop. Same calm petrol card, no warning color: "Back to basics: Receiving", "Full explanations · 20 questions", Play · 5 min. The session opens every explanation without asking.
done: card heading "Done for today" (with check icon) / "Next reviews tomorrow" + Practise anyway (secondary) → /play. The streak is the saffron element, reads "5 days", scales in once (.pop-in, 300 ms).
Quest marks are status, not controls: role="img" "Done" / "Not done", not focusable; they tick from session data.
generating: same petrol hero, heading "Building your questions", an outlined in-hero bar (1 px currentColor) + "28 of 42 topics ready" (role="status", polite; announce at most every 10 %), saffron "Play Receiving · 5 min". Streak stays quiet.
offline: sunken role="status" "You’re offline / Sessions need a connection." + Try again; Play rendered disabled; nothing saffron. On the online event, refetch and swap to normal without moving focus.
Focus: sr-only h1, then lead action → quest → role card → nav. Returning from a session also lands on h1.
Streak pill carries sr-only " in a row". Haptics: none.
4 · Loading the session

Route: /play (before question 1) · Loading

Layout
Top bar: close only (label "Cancel"). No dock.
Static skeleton in the shape of a question: two 24 px lines (92 %, 64 %), four 56 px option blocks.
Bottom of scroll (padding-bottom 24): h1 "Preparing your session", bar, "12 of 20 questions ready".
Components

skel (aria-hidden), bar / bar-fill with role="progressbar" and aria-valuetext "12 of 20 questions ready", icon-btn.

Interaction
Advances to question 1 on its own when ready, replacing this history entry so Back does not return here.
Close ("Cancel") → /.
Status block is role="status": announce once on open and once when ready, not every increment.
Focus: h1. No spinner, nothing loops. Haptics: none.
5 · Session frame (all question screens)

Route: /play · QChoice, QMulti, QCloze, QVoice, QOrder, QImage

Layout
Top bar 56: close (End session) · progress bar (flex 1) + "7 of 20" overline · Read aloud toggle.
Scroll: stem as h1 (title-2), then the answer area.
Dock: "How sure are you?" + Sure / Unsure / Guessing (three equal 48 px), then Check (56).
No bottom nav.
Components

topbar, icon-btn (pressed = --brand-tint), bar / bar-fill, t-overline num, dock, conf / conf-btn / conf-tick / conf-legend (ADDITION), btn-primary btn-lg btn-block.

Interaction
Progress: role="progressbar" "Session progress", aria-valuenow = current question number, aria-valuetext "7 of 20".
End session → /; answered items are kept.
Read aloud: aria-pressed; when on, SpeechSynthesis reads the stem, then the options, on each new question; persists for the session; stops on Check.
Confidence: radiogroup labelled by its legend; checked shows a tick and the brand tint (not color alone).
Check is disabled until an answer and a confidence are set. Selections can change until Check.
Radiogroups use a roving tabindex: one Tab stop, arrow keys move and select.
Drawn reveals: multiple choice (five variants) and multi-select partial credit. Cloze, voice, order and diagram link straight to the next format in the prototype.
Critical is not marked on any question screen; see global rules.
6 · Multiple choice

Route: /play · QChoice, QError (error prop)

States: unanswered · answer + confidence set · error ("Couldn’t check").

Layout
Stem, then four options, gap 12, each ≥ 56 with a 20 px radio.
Error: sunken alert row between scroll and dock; Try again (primary, retry icon) replaces Check.
Components

opt-list role="radiogroup" labelled by the stem, opt role="radio" + radio, sunken, btn-primary.

Interaction
Check opens the reveal by answer × confidence: correct + Sure → correct, sure · correct + Unsure/Guessing → correct, unsure · wrong + Sure → sure and wrong · wrong + other → not quite.
Error: the answer is queued on the device (IndexedDB) and retried. role="alert" "Couldn’t check your answer. It’s saved on this phone." Focus moves to Try again (Check is gone). Success opens the reveal.
Focus: stem h1. After Check: the reveal heading. Haptics: none on select.
7 · Reveal

Route: overlay inside /play · Reveal, RevealUnsure, RevealNotQuite, RevealSureWrong, RevealNoSource, RevealPartial (variant prop)

States: correct, sure · correct, unsure · not quite · sure and wrong (critical) · correct, no source quote · partly right (multi-select).

Layout
Behind: the answered question, inert. Options marked correct (check + "Correct"), chosen wrong (x + "Not quite"), rest muted.
Scrim, then the sheet: top radius 16, max height = frame − 48, raised shadow, grabber 36 × 4.
Band (padding 24 / 16 / 16): 32 px icon disc, h2 "Correct" / "Not quite" / "Partly right", then "+10 XP" quiet (correct) or "1 of 2 found · 1 extra" (partial).
Body scrolls, gap 16. Foot: Continue (Got it for sure and wrong) + "Report this question".
Correct, sure: the answer line + Why disclosure (explanation + SOP quote).
Correct, unsure: leads with the same answer line, then explanation + quote, open without asking. No extra sentence about confidence.
Not quite: The answer / You chose pair, why-wrong line, quote, "This comes back later this session". No reflection field.
Sure and wrong: the pair, then a plain row (shield icon, no fill, no card) "Critical step · Comes back first next session", then "Why it felt right" / "What actually matters", then the optional reflection "In one line: why record before moving?", quote, "This comes back later this session".
No source: answer + explanation + "Not quoted from your SOP"; no quote block.
Partly right (multi-select): background question keeps square checks; amber band "Partly right" + "1 of 2 found · 1 extra"; one line per item that was off ("Broken seal: needs sign-off. You missed it." with check; "Mixed-SKU: no sign-off needed." with x); quote (§2.6); "This comes back later this session". Continue → QCloze.
Components

opt is-correct / is-wrong / is-rest + fb-mark / fb-word, scrim, sheet, grabber, sheet-band + fb-correct / fb-wrong / fb-learning, sheet-body, sheet-foot, xp xp-quiet, quote / quote-text / quote-src, field / input, link-btn muted-link. No saffron on the reveal.

Interaction
Sheet rises once: lq-rise, 300 ms --ease-out, translateY 32 → 0 with fade. Reduced motion: appears in place.
Sheet is role="dialog" aria-modal labelled by the band heading; the band is role="status" polite and announces the result once.
Focus: band heading. Order: Why (sure) or reflection (sure and wrong) → Continue / Got it → Report. Scrim tap does nothing.
Why: link-btn with aria-expanded; chevron flips.
Reflection (sure and wrong only) is optional, saved with the attempt; with the keyboard open the foot rides above it.
Continue / Got it → next question (QMulti; partial → QCloze). Report → the Report sheet replaces this one; "Back to result" returns here with focus on the Report link.
Partial credit: multi-select scores per option. The band states the answer result ("Partly right", found / extra counts), not a mastery label, and never "Wrong".
Haptics (proposal): result-correct on correct; result-miss on not quite, sure and wrong, and partial.
8 · Report this question

Route: overlay inside /play and /play/quick/:itemId · Report

Layout
Replaces the result sheet (never stacked): the answered question stays behind, inert, under one scrim.
Sheet header: back chevron icon-btn "Back to result" + h2 "Report this question". No grabber.
Four reasons as plain radio rows (48 high, divided, no boxes): "The answer looks incorrect", "The question is unclear", "It doesn’t match how we do it here", "Something else"; note textarea (2 rows, optional); caption "Goes to Northwind’s training team."
Foot: Send report (56) + Cancel (ghost).
Components

scrim, sheet, icon-btn, sheet-body, rows role="radiogroup" + button.row role="radio" with an inline 20 px radio (not opt, so reasons read as settings, not answers), field / textarea.input, sheet-foot, btn-primary, btn-ghost.

Interaction
Send report is disabled until a reason is picked. Sends item id, item version, attempt id, reason, note.
Send → continues the session (QMulti in the prototype); the next screen announces "Report sent" via role="status".
Back to result and Cancel → the result sheet again, focus on "Report this question". Android Back does the same.
Focus: sheet heading; trapped in the sheet. Swaps in place of the result sheet (no second rise). Haptics: none.
9 · Multi-select

Route: /play · QMulti

Layout
Stem + caption "Choose all that apply" (gap 4), then four options with square checks.
Components

opt-list role="group" (labelled by stem, described by the caption), opt role="checkbox" + check.

Interaction
The artboard opens mid-interaction: two options selected (Hazmat, Mixed-SKU), no confidence, so Check is still disabled.
Each option toggles aria-checked; each is its own Tab stop; Space toggles.
Check needs ≥ 1 selection + confidence → QCloze in the prototype. In the build these selections produce the partial-credit reveal (RevealPartial).
Focus: stem h1. Haptics: none.
10 · Cloze, keyboard open

Route: /play · QCloze

Layout
The sentence is one <label for> in title-2 (line height 40) wrapping an inline 88 × 36 numeric field, 20 px text; the whole line is the tap target.
Compact dock directly above the keyboard: "How sure are you?" legend + confidence + Check; padding 8, gap 8, no safe-area inset while the keyboard is up.
kbd-area drawn as the number pad (3 × 4 keys), standing in for the system keyboard; not built.
Components

input num inline, conf, dock, kbd-area (spec annotation only).

Interaction
Exception to the focus rule: the blank autofocuses and the keyboard opens on load.
inputmode="numeric", pattern="[0-9]*", autocomplete="off", label "Missing number"; digits only, max 3. Add enterkeyhint="done"; Enter = Check when enabled.
Dock stays visible above the keyboard (resizes-content / VisualViewport). Check → QVoice in the prototype.
Haptics: none.
11 · Short answer, voice

Route: /play · QVoice, QVoiceRecording (step prop)

States: idle · recording · review (default).

Layout
Stem only, no critical marker (critical is shown on the reveal).
Idle: centered 64 px round mic button (brand), "Tap to record", "Type instead" link.
Recording: sunken transcript (≥ 72), static five-bar level, 64 px button in pressed style (brand-hover + 2 px ring) showing a filled stop square, "Tap to stop".
Review: "Your answer" textarea (4 rows, editable), Record again (secondary, mic icon).
Components

sunken, link-btn, field / textarea.input, btn-secondary, conf. The 64 px mic button is one-off; candidate for a DS class.

Interaction
Tap to start, tap to stop (one button, "Record answer" → "Stop recording", aria-pressed). No press-and-hold, so it works with gloves, keyboards and switches.
Mic permission is asked on the first tap only (matches the Disclosure).
Stop → review with the transcript in the editable field. "Type instead" → review with an empty field.
Check needs non-empty text + confidence, review state only → QOrder in the prototype.
Announce "Recording" on start and the final transcript once on stop. Throttle the live transcript region (polite) to final phrases, not every partial result.
Focus: stem h1. After start: Stop recording. After stop: the answer field.
Haptics (proposal): record on start and on stop; the thumb covers the button.
12 · Order the steps

Route: /play · QOrder

Layout
Stem, then the instruction "Tap the steps in order" (caption) with Clear (ghost) on the right once anything is placed.
Four steps as options: 28 px position badge (dashed empty, brand filled with the number) + label. No drag handle.
Components

opt-list, opt / opt is-selected, btn-ghost. The position badge is inline; candidate for a DS class.

Interaction
Tap-to-number only, no drag. Tap an unplaced step to give it the next number; tap a numbered step to remove it (later ones move up). Clear empties all.
The artboard opens mid-interaction: "Scan the return label" = 1, "Inspect the item" = 2, Check disabled.
Each step: aria-label "Inspect the item, position 2" / "…, not placed yet". Announce the new position via a polite status ("Inspect the item, 2 of 4").
Focus stays on the tapped step; after Clear it goes to the first step.
Check needs all four placed + confidence → QImage in the prototype. Haptics: none.
13 · Question with a diagram

Route: /play · QImage

Layout
Stem, location-label diagram (full width × 148), then four standard options (opt, 56, gap 12). The scroll region handles overflow; the dock never moves.
Diagram: label card with barcode, "A12-04-C-2", boxed check digits "57", callouts Aisle, Bay, Level, Position, Check digits.
Components

Inline SVG drawn with tokens (works in dark), role="img" with a full text description; opt-list radiogroup with opt.

Interaction
As multiple choice. Check → Summary in the prototype (last question).
Customer-supplied images need author-written alt text; the content pipeline should require it.
Focus: stem h1. Haptics: none.
14 · Session summary

Route: end of /play · Summary

Layout
No top bar. Scroll padding 32 / 16 / 24, gap 32.
h1 "Session done", "16 of 20 correct · 4:52"; then "+180 XP" and "5 days in a row"; then the sunken coach line directly under the stats ("Tomorrow: 5 reviews, then pedestrian lanes. …").
Mastery moved: rows with name, "58% → 72%", bar = earlier value (--ink-muted, meets 3:1 for graphics) + gain (--brand) + benchmark tick at 85%.
Mistakes (4): one 48 px disclosure row between dividers, collapsed by default; open shows rows with chevron and "You were sure" where it applies.
Dock: Continue (56) + "Another session" (link, 48).
Components

xp (the saffron element), streak streak-quiet pop-in, sunken, section-title, rows / row / row-link, bar / bar-before / bar-gain / bar-bench (ADDITION), link-btn, dock.

Interaction
Continue → push opt-in after the first finished session (while permission is undecided); after later sessions → /. Another session → /play.
Streak pill scales in once (300 ms).
Mastery bars: aria-valuetext "72%, up from 58%. Benchmark 85%".
Mistakes row: button with aria-expanded, chevron flips, focus stays on it. Mistake rows are links (to a review of that item; prototype → QChoice), aria-label "Review: …. You were sure".
Focus: h1. Haptics: none.
15 · Push opt-in

Route: not in spec · OptIn, OptInIOS (platform prop)

States: Android (permission) · iOS step 1 (add to Home Screen first).

Layout
Android: scroll padding 48. h1 "Get a question during your shift?", notification preview (OS colors, radius 16), three plain body-lg lines (gap 12, no icons): daily cap; the company window "Only 6:00 AM–6:00 PM, Monday to Friday. You can narrow it in Settings."; "Skip any. Nothing is lost."
Dock: Turn on questions (56) + Not now (ghost).
iOS: top bar with "1 of 2" on the right (sr-only "Step"), h1 "Add Learn Quiz to your Home Screen", one line why, three numbered steps (32 px circles, Share and add-home icons). Dock: I’ve added it + Not now.
Components

--os-card / --os-ink / --os-ink-muted (ADDITION) for the preview, t-title1, t-body-lg, t-overline, btn-primary, btn-ghost. No saffron.

Interaction
Turn on calls Notification.requestPermission() only from this tap, then PushManager.subscribe (VAPID) and posts the subscription. Granted → done (PushLock in the prototype).
Not now → / (done state). Ask again after a later session, not on every launch.
Cap and hours are data. Opt-in shows the company window (6:00 AM–6:00 PM, Mon–Fri) because the learner has not narrowed it yet; after narrowing (Jordan: 7:00 AM–3:30 PM) sends follow the learner’s window.
iOS: skip step 1 when already standalone (display-mode: standalone). I’ve added it → step 2 = the Android screen.
Preview card is role="img" with the notification text. Focus: h1. Haptics: none.
16 · Push notification

Route: opens /play/quick/:itemId · PushLock, PushHeadsUp (view prop)

States: lock screen · heads-up over another app. OS chrome, not app UI.

Layout
Lock: OS ground, clock 9:41, "Tuesday, November 3", notification card: 20 px brand badge, "Learn Quiz · now", the stem in 600.
Heads-up: over a light home screen (sunken ground, icon grid), a light card (surface-card, ink) 16 from the top, 8 side inset, raised shadow.
Stem is 55 characters; keep pushed stems ≤ 60 so the collapsed notification does not truncate.
Components

Built by the OS from the payload. App supplies: manifest name, a monochrome badge icon, body text.

Interaction
Payload: body = stem, data.itemId, tag per item (no duplicates), no action buttons (answer in the app).
Service worker notificationclick: focus an open client and navigate, else clients.openWindow('/play/quick/' + itemId).
Send only inside the learner’s window and daily cap; set TTL to the window’s end so nothing arrives after hours.
Heads-up vs. tray is the OS’s call on the web. Sound and vibration: OS default.
17 · Quick session, one question

Route: /play/quick/:itemId · QuickQuestion

Layout
Top bar: close · "1 question" label in place of the progress bar · Read aloud.
Body and dock as multiple choice.
Components

Same as the session frame and multiple choice.

Interaction
Cold start from a notification: render the item from the service-worker cache so it opens fast and survives a weak signal; sync the answer when online.
Check → QuickDone (inline result, no sheet). Close → /.
Focus: stem h1. Haptics (proposal): on Check, as the reveal.
18 · Quick session, done

Route: /play/quick/:itemId (result) · QuickDone

Layout
Top bar: close only. sr-only h1 "Quick question done".
Result card in the reveal’s language: tinted band (check + "Correct", fb-head, padding 12 / 16) on top of a bordered card, the answer in body-lg below. SOP quote. "1 review cleared · 3 left today".
Dock: Back to Today (56) + "Report this question".
Components

fb-correct + fb-head (band), quote, btn-primary, link-btn muted-link. A miss uses fb-wrong + "Not quite" + the answer (not drawn).

Interaction
Band is role="status" polite and announces the result.
Back to Today and close → / (Today shows the cleared review). Report → Report sheet.
Focus: sr-only h1. Haptics: none here (fired on Check).
19 · Path

Route: not in spec · Path

Layout
No top bar. Scroll padding 24 / 16 / 24. h1 "Warehouse picker", "66% of 85% benchmark · Day 16 of 30", role bar with benchmark.
Ordered units, gap 8: a plain 32 px numbered node on a 2 px rail (row ≥ 48) + tight card (name 17/24, %, bar with benchmark).
Node carries kind only, the bar carries progress: in progress = solid border-strong ring + number; current unit (Picking) = brand ring + brand number, plus a brand caption "Next" after the unit name; estimate = dashed ring; not started = dotted ring; mastered = check on brand-tint; locked = lock on sunken.
Estimate (Safety): bar is a 2 px dashed --ink-muted outline, no fill; "~40%" in muted ink; Estimate chip under the bar. Profile uses the same treatment.
Chips only for exceptions: Mastered, Estimate, Not started, Locked, and "3 critical". In-progress units (Picking, Scanning) show no chip row.
Bottom nav, Path current.
Components

Path node (ADDITION, 32 px circle, 2 px border, inline style; candidate for a DS class), card card-tight, bar / bar-fill / bar-est / bar-bench, chip-mastered / chip-estimate / chip-none, tag, nav.

Interaction
Each row is one link → that unit’s detail (all go to Receiving in the prototype).
Row aria-label: "Unit 1, Receiving: 82%, Still learning, 3 critical concepts"; current reads "Unit 2, Picking, Next up: 68%, …"; estimate reads "about 40%, Placement estimate, not practised yet". Inner bar and node are aria-hidden.
Mastered = at or above the 85% benchmark. "Next" = the unit the next session starts with (from the scheduler).
Focus: h1. Haptics: none.
20 · Unit detail

Route: not in spec · Unit (Receiving), UnitDiagram (scroll = 600, shows the procedure diagram)

Layout
Top bar: back + h1 "Receiving" (title-2).
Mastery: "82%" (title-1) + "of 85% benchmark", 12 px bar with benchmark.
Concepts card: per row name + %, bar + benchmark, status chip + Critical chip.
Procedure: card with a 326 × 360 flowchart, caption "Receiving SOP v3 · §2". The critical step has a 2 px ink outline and shield, never red.
Dock: Practise Receiving · 5 min. No bottom nav.
Components

topbar, icon-btn, bar bar-lg, bar-bench, card rows, chip-mastered / chip-learning / chip-critical, inline SVG diagram (role="img" with the full procedure as text), dock, btn-primary.

Interaction
Back ("Back to Path") → Path; focus returns to this unit’s row.
Practise → a session scoped to this unit (/play with a unit scope; parameter not in spec).
Concept bars: aria-valuetext "72%, Still learning, critical, benchmark 85%".
scroll prop sets the initial scrollTop of the scroll region (artboard only, not app state).
Focus: h1. Haptics: none.
21 · Training progress

Route: /me/profile · Profile, ProfileEmpty (state prop), ProfileErrors (scroll = 1300, shows "Critical steps to recheck")

States: normal · empty (before session 1).

Layout
Header: h1 "Training progress" + Settings gear; "Jordan Reyes · Warehouse picker"; eye caption "Your company's training admins see this same page." Only company owners and admins can open a learner's page; there is no manager role.
Mastery card: "66%" (display) + "of 85% benchmark", 12 px bar, two facts: "Day 16 of 30", "Projected: Nov 12 / Reaches 85% on day 25".
Weekly trend: 188 px line chart, 3 weekly points, dashed projection to 85% on Nov 12, dashed benchmark line.
By unit: accordion rows (Receiving open), bars, concept lists with chips. Safety: dashed estimate bar + Estimate chip under the bar, as on Path.
Critical steps to recheck: two rows, each led by a neutral state chip ("Corrected Oct 30" / "Comes back first"), then the concept name and caption "Answered with confidence, missed Oct 28" / "Nov 2". These are records, not mastery states, so no green/amber.
Flag an unfair result (secondary). Bottom nav, Profile current.
Empty: no 0%. Leads with "Day 1 of 30 · Benchmark 85%" (title-2), empty bar with benchmark tick, "Your progress shows up after your first session."; dock "Play first session" above the nav.
Components

t-display num, card, bar bar-lg / bar-fill / bar-est / bar-bench, inline SVG chart + sr-only data table, card rows, chip-estimate / chip-mastered / chip-learning / chip-none / chip-critical / chip-neutral (ADDITION), btn-secondary, dock, nav.

Interaction
Gear → Settings. Empty-state Play first session → /play; its bar reads aria-valuetext "No sessions yet, benchmark 85%". Flag an unfair result → the report sheet (prototype); the real flow is not designed.
scroll prop sets the initial scrollTop (artboard only).
Unit rows: h3 > button with aria-expanded + aria-controls; focus stays on the button; chevron rotates 150 ms (none under reduced motion).
Chart is not interactive; its numbers are in the sr-only table ("Role mastery by week").
Same data as the manager sees; no hidden fields on either side.
Focus: h1. Haptics: none.
22 · Settings

Route: not in spec · Settings

Layout
Top bar: back + h1 "Settings". Sections gap 32.
Learning questions: "Send me questions" switch; working hours From / To (7:00 AM, 3:30 PM), caption "Inside Northwind’s hours: 6:00 AM–6:00 PM"; days Mon–Fri as five toggles.
Appearance: System / Light / Dark.
Account: Email (read-only), "What we record" → Disclosure, Sign out (secondary) → Join.
Selected day and appearance chips show a 16 px check before the label plus the brand tint (not color alone).
Components

switch (ADDITION, role="switch"), input styled time buttons, seg / seg-btn, rows / row / row-link, section-title, btn-secondary.

Interaction
Every change saves immediately (no Save button); on failure revert the control and show role="alert".
Switch off: server pauses sends (keep the subscription); "Paused. Turn back on any time." appears as role="status". The switch’s hit area is 48 px (::before) around the 52 × 32 track.
Times: native <input type="time" step="1800"> clamped to the company window, end ≥ start + 30 min (the prototype cycles in 30-minute steps).
Days: aria-pressed toggles; the last day on cannot be turned off; announce "At least one day" via role="status".
Appearance: radiogroup; System follows prefers-color-scheme; stored per device; applies at once.
Back → Profile, focus on the gear. Focus on load: h1. Haptics: none.
Open questions
Expo haptics mapping: is result-correct → expo-haptics notificationAsync(Success), result-miss → Warning (not Error), record → impactAsync(Light)? Do we need a haptics off switch in Settings?
iOS PWA push: Web Push works only for Home Screen web apps (iOS 16.4+), and permission must be asked inside the installed app from a tap. "I’ve added it" in a Safari tab cannot hand over to the installed app. What should Safari show after step 1?
What does "Practise anyway" (Today, done) and "Another session" count toward: the streak (already earned today), XP, the review schedule?
Does a quick question from a push count as the day’s session for the streak and the daily quest?
Reveals for cloze, voice, order and diagram are not drawn. Each needs its own "your answer vs. the answer" layout. For order: does a partly right sequence get partial credit like multi-select?
Voice: Chrome’s SpeechRecognition sends audio to Google. Does that fit the Disclosure, or do we record and transcribe on our servers? How long may grading a free-text answer take (no wait state drawn)?
Android Back and End session mid-session: leave at once (prototype) or confirm?
Sheet grabber: draggable (to expand long explanations) or remove it?
Does a reported question still count toward mastery until the training team reviews it?
Design-system proposal (a DS decision, not changed in these screens): in dark theme the DS primary fill (--brand, light cyan #6FC3DC) is the brightest element on screen and competes with the answer band. Proposal: a deeper dark-mode primary button fill, about #2A7F99 with near-white text (contrast to be AA-checked before adoption), while cyan stays for focus rings, links and bars.
Back to basics (Today): what triggers the level drop (threshold, window), and does the learner get the reason anywhere?
Not drawn: Join errors (expired invite, account exists), push permission denied, the review screen behind Summary mistake rows, the "Flag an unfair result" flow, Sign out confirmation, a quick question that is expired or already answered, slow or failed session loading.

## Design-system additions

Learn Quiz learner app · design-system additions

Extends Petrol & Saffron v1 past its five components. Every specimen is live lq.css.

Answer moment
Confidence picker

Rates certainty before Check; it decides the reveal.

Unselected

Selected

Focus

Disabled

Sure
Unsure
Guessing

N/A

Tokens
border-strong · surface-card · brand · brand-tint · target
A11y
radiogroup of role=radio + aria-checked; tick, not tint alone
Check gating

Check unlocks once answer and confidence are set.

Answer or confidence missing

Both set

Check
Check
Tokens
sunken, dashed, ink-muted 5.1:1 → brand, on-brand 7.7:1
A11y
Real disabled button, swapped in place; never hidden
Result sheet

The answer reveal: the one expressive moment in a session.

Anatomy

1
2

Correct

3

Photograph the damage and note it on the receipt.

4
Continue
5

Correct, sure · answer; Why on request

Correct

+10 XP

Correct, unsure · reasoning shown unasked

Correct

+10 XP

Not quite · answer beside your choice

Not quite

Sure and wrong · same band; adds critical row and misconception

Not quite

Parts

1
1.
Scrim · the question behind is inert
2
2.
Grabber · 36 × 4, border-strong
3
3.
Band · role=status, aria-live=polite
4
4.
Body · scrolls: answer, why, source
5
5.
Footer · fixed: Continue, Report

Motion

0
300 ms
Enter
Once · 300 ms · translateY 32 → 0 + opacity
Easing
ease-out, cubic-bezier(0.2, 0, 0, 1)
Reduced
No animation; the sheet is just there
Haptics
Light on Correct · warning on Not quite
Tokens
scrim · radius-lg · shadow-raised · feedback-* + tint · on-feedback · duration-reveal · ease-out
More
Multi-select partial credit: “Partly right” on feedback-learning.
A11y
role=dialog + aria-modal. The band announces the result: icon + word, never color alone.
Source quote

The SOP passage behind the answer, with its reference.

With source

“A double beep means wrong item. Put the item back in its slot, then re-scan the location label before you pick again.”
Scanning SOP v2 · §3.2

Without source

Not quoted from your SOP

Tokens
surface-sunken · ink 15.2:1 · ink-muted 5.1:1
A11y
figure + blockquote + figcaption; no source is said
Critical marker

Flags safety-critical concepts in neutral ink, never red.

Chip on a concept

Count on a unit row

Critical
3 critical

Call-out row on the reveal, sure and wrong

Critical step · This comes back first next session.

Tokens
ink · border-strong · surface-card · surface-sunken
A11y
Word always printed, shield aria-hidden. Red = wrong answer only.
XP chip and quiet variants

Saffron marks one reward or one key action per screen.

Reward leads (Summary): XP chip, quiet streak

+180 XP
5 days in a row

Action leads (Today): saffron button, rest quiet

Play · 5 min
4 days
in a row
1,240 XP
Tokens
accent · on-accent 8.9:1 · surface-card · border · ink-muted
A11y
Ink on saffron, never white. Quiet keeps the words, drops the fill.
Progress
Mastery bar additions

Measured vs estimated, the benchmark, and what moved.

Measured

68%

Estimate

~40%
Estimate

Benchmark

66% / 85%

Moved

58% → 72%
Tokens
brand fill and gain · ink bench tick · ink-muted estimate dash and earlier value
A11y
aria-valuetext “72%, up from 58%”; value printed
Path node

Unit marker on the rail: kind only; the bar shows progress.

Mastered
2
Next up
3
In progress
4
Estimate
5
Not started
Locked
Tokens
32 px · 2 px border-strong · brand · brand-tint · sunken
A11y
aria-hidden; the row link names unit, % and status
Weekly trend chart

Weekly role mastery against the benchmark, with projection.

100%
85%
50%
0%
29%
48%
66%
Oct 19
Oct 26
Nov 2
Nov 12
Measured
Projected
Benchmark 85%
Role mastery by week
Week of	Mastery
Oct 19	29%
Oct 26	48%
Nov 2	66%
Nov 12 (projected)	85%
Spec
2 px strokes · dash 6/6 projection, 4/4 benchmark · ≥ 12 px
Tokens
brand · ink · ink-muted · border; never saffron
A11y
role=img sentence + hidden table; dashes, not color
App shell and controls
Push notification

One question on the lock screen; one tap opens it.

Android lock screen

Learn Quiz · now
1
Your scanner double-beeps on a pick. What do you do first?
2
1
OS header, drawn by Android: icon + “Learn Quiz · now”
2
Title = the question only, ≤ 60 chars (here 58); no body
Tap
Deep link /play/quick/:itemId · heads-up: same card, raised
Tokens
os-ground · os-card · os-ink 12.2:1 · os-ink-muted 7.3:1
A11y
One link, named with app, time and question
Bottom navigation

Three destinations outside a session; hidden inside one.

Active

Inactive

Inactive

Today
Path
Profile
Size
nav-h 64 + safe-bottom · thirds · pill 56 × 30 · label 12/16
Tokens
surface-card · ink-muted → brand + brand-tint pill
A11y
aria-current=“page” on the active link; pill + color + label.
Switch and segmented control

An on/off setting, and one choice out of a few.

Off
On

Segment off

Segment on

Segment off

System
Light
Dark
Tokens
border-strong · sunken → brand · on-brand · brand-tint
A11y
role=switch, 48 px hit · segments: radio or aria-pressed
Foundations
Added tokens

Scrim, OS chrome and layout constants, per theme.

Token	Light	Dark	Use
scrim	
#14181F 48%
	
#000 60%
	Behind sheets
os-ground	
#1A1C1F
	Same	Lock screen
os-card	
#2B2E33
	Same	Notification
os-ink	
#F1F2F4
	Same	Title
os-ink-muted	
#B9BEC6
	Same	OS header
target	48 px	Same	Min touch target
topbar-h	56 px	Same	Plus safe-top
nav-h	64 px	Same	Plus safe-bottom
safe-top	env(), 0 px	Same	Status bar inset
safe-bottom	env(), min 8	Same	Home indicator
New icons

24 grid, 2 px stroke, round caps, drawn in currentColor.

critical
listen
mic
drag
offline
retry
flag
share
add-home
eye
path
A11y
16 / 20 / 24 · aria-hidden by a label, else aria-label
White-label rule

A customer color replaces brand; nothing else moves.

Petrol
Aa
Light #0E5A73 · 7.7:1
Aa
Dark #6FC3DC · 9.2:1
Plum
Aa
#5B2A6E · 10.5:1
Aa
#D3AEE2 · 9.6:1
Derive
hover −12% L · tint 92% L (dark: deep) · on-brand by contrast
Rule
Brand ≥ 4.5:1 to on-brand and surface-page, both themes
Fixed
Mark’s saffron dot · accent · neutrals · all feedback colors
