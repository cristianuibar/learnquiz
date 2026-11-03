# Learn Quiz design system (Claude Design export, v2, 2026-11-03)

Source: https://claude.ai/artifact/E1TJkimx8FJtEA3fABn3wd (bundle 1793673342-4ffe). Raw files on bum-tuf at ~/lq-design-system-v2/. Logo and icon SVGs were not downloadable (403, sign-in required).

## Brand book
````markdown
# Learn Quiz

Companies upload their procedures. New hires learn them through one-minute quizzes sent as push notifications. Managers see who has mastered their role.

## Rules

1. Calm everywhere, bright only when someone answers. Petrol and neutrals carry the screen. Saffron marks one thing: a reward or the single action that matters.
2. Green, red and amber mean answer feedback. Nothing else uses them.
3. Feedback is never color alone. Icon and label, always: ✓ Correct, ✗ Not quite, ◐ Still learning.
4. One element leads each screen. If a screen needs helper text to make sense, fix the layout.
5. Only tokens. No raw hex, no one-off sizes.
6. Text meets WCAG AA (4.5:1) in both themes. Controls and focus rings meet 3:1.

## Color

| Token | Light | Dark | Use |
|---|---|---|---|
| `brand` | `#0E5A73` | `#6FC3DC` | Buttons, links, focus, headers |
| `on-brand` | `#FFFFFF` | `#121417` | Text on `brand` |
| `accent` | `#F2A900` | `#F2A900` | Streaks, rewards, the one key action |
| `on-accent` | `#14181F` | `#14181F` | Text on `accent`. Never white. |
| `ink` | `#14181F` | `#ECEEF1` | Text |
| `ink-muted` | `#5B6472` | `#A0A8B4` | Secondary text, sparingly |
| `surface-page` | `#F7F6F2` | `#121417` | Background |
| `surface-card` | `#FFFFFF` | `#1B1F24` | Cards, with a 1px `border` |

Feedback colors are fixed and are never white-labeled:

| Token | Light | Dark | Always with |
|---|---|---|---|
| `feedback-correct` | `#1E7F4F` | `#5CCB93` | ✓ Correct |
| `feedback-wrong` | `#C4352B` | `#F2786E` | ✗ Not quite |
| `feedback-learning` | `#9A5B00` | `#E6A84A` | ◐ Still learning |

Each has a `-tint` for the ground of an answer or banner. Text on a tint is `ink`; the icon and label use the solid color.

Saffron is a fill, not a line. On white it is 2:1, so never use it for text, thin icons or chart lines.

Never use green, red, purple, teal or Facebook blue as a brand color.

## White-label

A customer supplies one color. It replaces `brand`; `brand-hover`, `brand-tint` and `on-brand` are derived from it (white or ink, whichever clears 4.5:1). A green or red customer color is darkened or rejected so it can't be read as feedback.

## Type

Inter, from Google Fonts (400, 500, 600, 700). One family; hierarchy comes from size and weight.

| Style | Size / line | Use |
|---|---|---|
| `display` | 40 / 44, 700 | Rewards, portal hero numbers |
| `title-1` | 28 / 34, 700 | Page titles |
| `title-2` | 20 / 28, 600 | Quiz questions, card titles |
| `body-lg` | 17 / 26 | Answer options |
| `body` | 15 / 22 | Default text |
| `label` | 14 / 20, 600 | Buttons, tabs, feedback labels |
| `caption` | 13 / 18, 500 | Metadata, only where it can't be cut |
| `overline` | 12 / 16, 600 | Progress counters ("3 of 5") |

Use tabular numbers for scores and percentages.

## Shape and space

- Radius: 8px (`radius-md`) for controls and cards, 16px (`radius-lg`) for sheets, `radius-full` only for pills.
- Spacing on a 4px grid: 4, 8, 12, 16, 24, 32, 48.
- Cards use a border, no shadow. `shadow-raised` is only for sheets and menus that float.
- Tap targets at least 44 × 44px.
- Focus ring: 2px `brand` outline, 2px offset, on every interactive element. Never removed.
- Breakpoints: `breakpoint-md` 640px, `breakpoint-lg` 1024px. Mobile first.

## Motion

Routine UI: `duration-fast` (150ms) with `ease-out`, on color and transform only. The answer is the one expressive moment: `duration-reveal` (300ms): the result sheet rises once, a streak milestone scales in once. No bounce, no loops. Respect `prefers-reduced-motion`.

Haptics on mobile: light impact for Correct, warning for Not quite. Nothing else vibrates.

## Copy

US English. Short, plain, specific to the procedure on screen.

- Buttons start with a verb: "Start quiz", "Upload SOP". Never "Submit" or "OK".
- Feedback: "Correct", "Not quite". Never "Wrong" or "Fail".
- Progress states a fact: "3 days in a row". No cheering, no guilt.
- Push notifications: the question itself, under 60 characters. No body text, no app name (the OS shows it).
- Empty states give the next step: "Upload your first SOP."
- Errors say what happened and what to do. Never "Oops".
- No taglines, no hype ("seamless", "unlock", "elevate", "journey"), no exclamation marks in the portal.

## Logo

A petrol ring with one saffron dot: a Q, and the reward it leads to. Files in Assets › Logo; usage rules in its README.

- Mark on light grounds `learnquiz-mark.svg`, on dark `learnquiz-mark-dark.svg`, one color `learnquiz-mark-mono.svg`.
- App icon `learnquiz-app-icon.svg`: 1024px square, unrounded (the OS masks it).
- Android push icon `learnquiz-notification.svg`: white on transparent. iOS uses the app icon.
- White-label: the ring takes the customer's `brand`; the dot stays saffron.

## Icons

27 line icons in Assets › Icons. 24px grid, 2px stroke, round caps and joins, `stroke="currentColor"`. Inline them and color with CSS. Feedback icons (`check`, `x`, `still-learning`, `not-started`) always appear with their label.

## Never

Gradients, glows, glass, gradient text. Border plus shadow on the same card. Colored stripes on the left of cards. Decorative eyebrow labels. Icon tiles on every card. Emoji. Stock photos or 3D illustration.
````

## Tokens

Colors (light / dark):

| Token | Light | Dark | Usage (verbatim) |
|---|---|---|---|
| brand | #0E5A73 | #6FC3DC | Petrol. Headers, primary buttons, links, focus rings. The white-label slot: a customer's color replaces this token only. |
| brand-hover | #0A4759 | #94D4E7 | Hover/pressed state of brand fills and links. |
| on-brand | #FFFFFF | #121417 | Text and icons on a brand fill. White on petrol is 7.7:1; in dark mode the fill is light, so text is near-black. |
| brand-tint | #E3EFF3 | #163240 | Quiet brand surfaces: selected rows, active nav item, info banners. Body text in ink sits on it. |
| accent | #F2A900 | #F2A900 | Saffron. Streaks, highlights, celebrations and the one call to action that matters on a screen. Never more than one accent CTA per view. |
| accent-hover | #D99700 | #FFBE2E | Hover/pressed state of accent fills. |
| on-accent | #14181F | #14181F | Text on saffron. Always ink, never white, in both themes. |
| accent-tint | #FDF3D9 | #2E2610 | Soft saffron ground for streak cards and reward moments. Ink text on it. |
| ink | #14181F | #ECEEF1 | Primary text on surface-page and surface-card. |
| ink-muted | #5B6472 | #A0A8B4 | Slate. Secondary text, captions, metadata on surface-page and surface-card. |
| surface-page | #F7F6F2 | #121417 | Warm paper. App and portal background. |
| surface-card | #FFFFFF | #1B1F24 | Cards, sheets, quiz question panels, table bodies. Separated from the page by a 1px border, not a shadow. |
| surface-sunken | #EFEDE7 | #0D0F11 | Inputs at rest, progress tracks, code and inset areas. |
| border | #DEDBD2 | #2E333B | Hairline dividers and card outlines (decorative, not a control boundary). |
| border-strong | #7E8591 | #6B7380 | Control borders: inputs, unselected answer options, checkboxes. Meets 3:1 on surface-page, surface-card and surface-sunken. |
| feedback-correct | #1E7F4F | #5CCB93 | Correct answer. Always paired with a ✓ icon and the label 'Correct'. Reserved: never a brand or decorative color. |
| feedback-correct-tint | #F0F8F3 | #14291F | Ground of a correct answer option or result banner; text on it is ink, icon and label in feedback-correct. |
| feedback-wrong | #C4352B | #F2786E | Wrong answer. Always paired with a ✗ icon and the label 'Not quite'. Reserved: never a brand or decorative color. |
| feedback-wrong-tint | #FBE9E7 | #301816 | Ground of a wrong answer option or result banner; text on it is ink, icon and label in feedback-wrong. |
| feedback-learning | #9A5B00 | #E6A84A | Still learning / partial mastery. Always paired with a ◐ icon and the label 'Still learning'. Kept darker than saffron so it never reads as the accent. |
| feedback-learning-tint | #FAF0DF | #2C2112 | Ground of a still-learning chip or banner; ink text, icon and label in feedback-learning. |
| on-feedback | #FFFFFF | #121417 | Text on a solid feedback fill (e.g. a filled 'Correct' pill). |

Type, spacing, radius, shadow, motion and breakpoints:
```json
"type": {
  "families": { "sans": "Inter, system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif" },
  "styles": [
    { "name": "display",  "fontSize": "40px", "lineHeight": "44px", "fontWeight": 700, "letterSpacing": "-0.02em" },
    { "name": "title-1",  "fontSize": "28px", "lineHeight": "34px", "fontWeight": 700, "letterSpacing": "-0.01em" },
    { "name": "title-2",  "fontSize": "20px", "lineHeight": "28px", "fontWeight": 600 },
    { "name": "body-lg",  "fontSize": "17px", "lineHeight": "26px", "fontWeight": 400 },
    { "name": "body",     "fontSize": "15px", "lineHeight": "22px", "fontWeight": 400 },
    { "name": "label",    "fontSize": "14px", "lineHeight": "20px", "fontWeight": 600 },
    { "name": "caption",  "fontSize": "13px", "lineHeight": "18px", "fontWeight": 500 },
    { "name": "overline", "fontSize": "12px", "lineHeight": "16px", "fontWeight": 600, "letterSpacing": "0.02em" }
  ]
},
"spacing": { "space-1": "4px", "space-2": "8px", "space-3": "12px", "space-4": "16px", "space-6": "24px", "space-8": "32px", "space-12": "48px" },
"radius":  { "radius-sm": "4px", "radius-md": "8px", "radius-lg": "16px", "radius-full": "9999px" },
"shadow":  { "shadow-raised": { "light": "0 8px 24px rgba(20,24,31,0.12)", "dark": "0 8px 24px rgba(0,0,0,0.5)" } },
"duration": {
  "duration-fast":   "150ms  // Routine UI: hover, press, color changes, toggles.",
  "duration-reveal": "300ms  // The answer moment only: result sheet rising, streak milestone scaling in. Set to 0ms under prefers-reduced-motion."
},
"easing": {
  "ease-out": "cubic-bezier(0.2, 0, 0, 1)  // The only easing. No bounce or elastic curves."
},
"breakpoint": {
  "breakpoint-md": "640px   // Phone to tablet. Below this, single column and 16px gutters. Use in media queries as a literal (CSS vars can't be used in @media).",
  "breakpoint-lg": "1024px  // Manager portal: sidebar plus content. Content never wider than 1120px."
}
```

## Components

### AnswerOption
````markdown
AnswerOption is a full-width tappable quiz answer in default, selected, correct and wrong states.

## Use
- One per choice, one selected at a time
- Show correct and wrong only after submit; mark the right option when wrong
## States
- Default, selected (brand), correct (check), wrong (cross)
## Tokens
- brand-tint, border-strong, feedback-correct, feedback-wrong, radius-md, .body-lg
## Accessibility
- Icon plus text label, never color alone
- 56px minimum height, constant 2px border
- aria-pressed on selection
## Don't
- Green or red before submit
- Feedback colors for selection
```html
<button class="opt body-lg" type="button" aria-pressed="false"><i class="radio" aria-hidden="true"></i><span>Middle shelf, next to the dairy</span></button>
<button class="opt selected body-lg" type="button" aria-pressed="true"><i class="radio" aria-hidden="true"></i><span>Top shelf, so it stays cold</span></button>
<button class="opt correct body-lg" type="button" aria-pressed="false"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span>Bottom shelf, below ready-to-eat food</span><b class="label">Correct</b></button>
<button class="opt wrong body-lg" type="button" aria-pressed="false"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg><span>Any shelf, if it is wrapped</span><b class="label">Not quite</b></button>
```
````

### Button
````markdown
Button is the action control, in primary, accent, secondary and ghost emphasis.

## Use
- Primary: main action; accent: one key action per screen
- Secondary: supporting; ghost: low emphasis
## States
- Hover, disabled, focus-visible
## Tokens
- brand, accent, ink, border-strong, surface-card, surface-sunken, radius-md, .label
## Accessibility
- 44px minimum height
- Visible 2px focus ring
- Disabled attribute plus fill change, not opacity
## Don't
- Two accent or two primary buttons per view
- Green or red fills
```html
<button class="btn label primary" type="button">Start quiz</button>
<button class="btn label accent" type="button">Continue</button>
<button class="btn label secondary" type="button">Review</button>
<button class="btn label ghost" type="button">Skip</button>
<button class="btn label primary" type="button" disabled>Start quiz</button>
```
````

### FeedbackBanner
````markdown
FeedbackBanner is the result panel shown after an answer: correct, not quite or still learning.

## Use
- Below the question after submit
- Add a sentence only if the right answer is not visible
## States
- Correct, not quite (shows right answer), still learning
## Tokens
- feedback-correct, feedback-wrong, feedback-learning, -tint, radius-md, .label, .body-lg
## Accessibility
- Distinct icon and text label per state
- role="status"
## Don't
- Decorative use of feedback colors
- Shaming wording
```html
<div class="fb correct" role="status"><p class="label"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Correct</p></div>
<div class="fb wrong" role="status"><p class="label"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg> Not quite</p><p class="body-lg">Bottom shelf, below ready-to-eat food.</p></div>
<div class="fb learning" role="status"><p class="label"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/></svg> Still learning</p></div>
```
````

### MasteryBar
````markdown
MasteryBar shows one person's mastery in the manager portal: name, status, bar and percentage.

## Use
- Team lists in the manager portal
- Not for a learner's own quiz progress
## States
- Mastered, still learning, not started
## Tokens
- brand, surface-card, surface-sunken, feedback-correct, feedback-learning, radius-full, .label
## Accessibility
- Icon plus text status, never color alone
- role="progressbar" with aria-valuenow and name
- Percentage printed as text
## Don't
- Green or red bar fill
- Rank by color alone
```html
<ul id="root">
<li><span class="label">Maria Garcia</span><span class="chip label mastered"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Mastered</span><div class="bar" role="progressbar" aria-label="Maria Garcia mastery" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100"><i style="width:100%"></i></div><span class="label">100%</span></li>
</ul>
```
````

### StreakBadge
````markdown
StreakBadge shows consecutive learning days as a saffron pill, with a larger milestone card.

## Use
- Pill in headers and profiles; card for milestones
- Number and unit only
## States
- Pill, milestone card
## Tokens
- accent, on-accent, accent-tint, radius-full, radius-lg, .label, .display
## Accessibility
- Count is text, flame is decorative
- 44px target if tappable
## Don't
- Green or red
- Emoji
- Streaks as a manager score
```html
<span class="badge label"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg> 7-day streak</span>
<div class="card" role="group" aria-label="30-day streak"><span class="medal"><svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg></span><p class="display">30 days</p></div>
```
````


## Logo and icons

**Logo**
````markdown
# Learn Quiz logo

A petrol ring with a saffron dot: a "Q" that is also a quiz target, with the dot as the small reward.

## Clear space and minimum sizes
- Clear space: keep at least 1/4 of the mark's height free on all sides (the ring's stroke width is a good ruler).
- Minimum size: mark 16 px, lockup 96 px wide (below that, use the mark alone).
- Notification icon: 24 px.

## Which file, where
| File | Use on | Ink |
|---|---|---|
| learnquiz-mark.svg | Light grounds (paper, white) | Ring #0E5A73, dot #F2A900 |
| learnquiz-mark-dark.svg | Dark grounds (ink, dark UI) | Ring #6FC3DC, dot #F2A900 |
| learnquiz-mark-mono.svg | One-color print, stamps, fax, watermarks | #14181F |
| learnquiz-notification.svg | Android/iOS push icon (24x24) | #FFFFFF on transparent |
| learnquiz-app-icon.svg | App stores, home screen (1024, full-bleed) | Petrol ground, white ring, #F2A900 dot |
| learnquiz-lockup.svg | Light grounds, mark + wordmark | Mark as above, wordmark #14181F |
| learnquiz-lockup-dark.svg | Dark grounds, mark + wordmark | Mark as dark, wordmark #F7F6F2 |

All colors are hard-coded; none of the files use currentColor.

## Don'ts
- Don't recolor, add gradients, glows, shadows, outlines, or 3D.
- Don't stretch, skew, rotate, or crop the mark.
- Don't re-typeset the wordmark; it is outlined Inter SemiBold.
- Don't place the colored mark on busy photos or mid-tone grounds; use the mono or dark file.
- Don't remove the gap around the dot or swap the dot's color.
````

**Icons**
````markdown
# Learn Quiz icons

A 27-icon line set for Learn Quiz (mobile app and manager web portal), drawn to the same standard as SF Symbols or Linear.

**Grid:** 24x24 viewBox, 2px stroke, round caps and joins, `fill="none"`, 2px padding (20x20 live area), 2px corner radius on rectangles, whole or half pixel coordinates.

**Use:** inline the SVG or reference it with `<img src="assets/Icons/bell.svg">`. Inline icons take their color from CSS `color` via `currentColor`. Sizes are 16, 20 and 24: scale the whole icon and the stroke scales with it. At 16px prefer a 1.5px stroke by overriding `stroke-width="1.5"`.

**Gallery note:** in this design system's gallery the icons display in black, because `<img>` cannot inherit `currentColor`.

**Feedback icons** (`check`, `x`, `still-learning`, `not-started`) always appear with a text label. Never rely on the shape alone.

| Name | Meaning | Name | Meaning |
|---|---|---|---|
| check | Correct | x | Incorrect / dismiss |
| still-learning | Partly learned | not-started | Not attempted |
| streak | Daily streak | bell | Push notification |
| sop | SOP document | upload | Upload SOP |
| timer | One-minute quiz | quiz | Quiz question |
| mastery | Mastery target | team | Team |
| person | Person | chart | Progress chart |
| home | Home | settings | Settings (sliders) |
| search | Search | plus | Add |
| chevron-right | Next / expand | chevron-left | Back |
| chevron-down | Expand | arrow-right | Continue |
| more | More actions | info | Information |
| lock | Locked | filter | Filter |
| calendar | Date |  |  |
````

**Icon paths used in the components** (all `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`):
- `check`: `<path d="M20 6 9 17l-5-5"/>`
- `x`: `<path d="M18 6 6 18M6 6l12 12"/>`
- `still-learning`: `<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>`
- `streak`: `<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>`

