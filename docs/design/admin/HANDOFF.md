# Admin: handoff notes

Runtime models are Muse models only (Muse Spark, Muse Spark Open, Muse Glimmer); where the design shows another model name, use the Muse model the code calls.

Text of the designer's handoff board (`source/Handoff.dc.html`), the design-system additions board (`source/DSAdditions.dc.html`, screenshots `screens/DSAdditions-tile-NN.png`) and the start board (`source/Main.dc.html`). The source files are the reference when this text is ambiguous.

## Handoff notes

Handoff notes

Partner portal and staff admin. One section per screen, in flow order. Artboard names link to the artboards.

Basics

Applies to every screen · Start board: Main · Design-system additions: DSAdditions, DSAdditions-Dark

Layout
Desktop-first web app. Frames at 1440 and 1024; partner Overview and People also at 390. Staff admin is desktop only.
≥1024: side nav 248px (.sidenav, sticky, full height) next to the content column (.main).
640–1023: nav becomes .topbar (56px, sticky) with a Menu button that opens the same list as a sheet.
<640: single column, 16px gutters, page actions stretch full width, figures go 2-up.
Tables at <640 stack via .dt-stack: each row becomes a 3-column grid, each cell labelled from its data-label; .stack-full, .stack-wide, .stack-hide place cells.
Forms, profiles and detail pages: .page.page-capped, content capped at 1120.
Tables and charts: .page, filling the content column. Dense data gains from width (fewer wraps, no sideways scroll); reading text does not, so its line length stays capped.
Below 1280, .dt-hide-lg drops secondary table columns and the Questions outline hides.
Components
admin.css = Petrol & Saffron tokens plus admin rules marked ADDITION. Tokens only; no raw hex except the Northwind logo and the mark's saffron dot.
Dark theme: data-theme="dark" on .lq swaps every token. Every key screen has a -Dark artboard.
White-label: company logo in the nav (.nav-org); the portal stays petrol. The customer accent shows only in the learner app.
Saffron .btn-accent: at most one per screen, the key action. Many screens have none. One .btn-primary per region.
Green, red and amber only for answer feedback and mastery status: .chip-mastered (Proficient, Mastered), .chip-learning (Still learning).
Operational state = chip + icon + word, by emphasis: .chip-dashed not started, .chip-tint in motion, .chip settled, .chip-strong needs a person, .chip-muted out of play.
Critical concepts: .chip-critical, shield icon and the word Critical.
Errors without red: .banner.banner-alert (alert icon, words first) and .field.is-invalid + .field-error.
Destructive: .btn-danger (solid ink), only inside a confirmation dialog with a .consequences list.
No spinners: determinate .meter progressbars for uploads and builds; static .skel / .skel-line skeletons for loading.
Interaction
Focus ring 2px brand, offset 2px. Targets 44px; icon-only buttons carry an aria-label naming the row ("More actions for Jordan Reyes").
Route change moves focus to the h1 (tabindex="-1"). Current nav item: aria-current="page".
Dialogs: role="dialog" + aria-modal, focus trapped, starts on the safest control, Esc closes, focus returns to the opener; page behind is aria-hidden.
Menus (.menu, role="menu") open from a visible More actions button with aria-haspopup and aria-expanded; Esc closes and returns focus.
Tables: <caption> (sr-only), th scope="col", .th-sort buttons inside th, aria-sort only on the sorted column. Sticky header offsets for the band and top bar.
Charts: svg.chart role="img" with a one-sentence summary plus an sr-only table of the same numbers. Series by dash, legend and direct labels.
Live updates: one persistent role="status" per screen, outside any conditional block, throttled. Blocking errors use role="alert", announced once.
prefers-reduced-motion: transitions drop to 0 ms. Nothing loops or pulses.
Staff read-only view: sticky inverse .ro-band on every portal screen; nav foot shows the .ro-pill "Read only" instead of the user.
Read-only removes every edit control from the DOM; nothing is shown disabled. The server enforces it: writes call requireOrgAdmin, staff reads call requireStaff.
Navigation

Every portal and staff screen · Artboards: PortalNav, StaffNav

Layout
PortalNav: company logo and name, then Overview, Roles, Questions, People, Settings; foot with the signed-in user and the Learn Quiz mark.
StaffNav: Learn Quiz mark and "Staff admin", then Companies, Users, Model usage, Generation jobs, Content flags; foot with the staff user.
Below 1024 both collapse to .topbar: logo, name (ellipsis), Menu button.
Components
.sidenav, .nav-org, .org-logo, .nav-list, .nav-item, .nav-foot, .nav-user, .avatar, .nav-poweredby, .topbar.
Generation jobs carries .nav-count with the failed-job count (sr-only " failed").
Props: PortalNav active, readonly; StaffNav active, failed.
Interaction
Items are links; the current one has aria-current="page" (brand-tint ground, brand icon).
Menu button: aria-expanded + aria-controls; the sheet holds the same list; Esc closes, focus returns to Menu.
Sign out: icon button, aria-label "Sign out". Read-only hides it and shows "Read only · Staff view".
The failed count follows the Generation jobs poll; it is not a live region.
1 · Create company

Route: /org/new · Artboards: CreateCompany, CreateCompany-Error, CreateCompany-Dark

Layout
No nav. Learn Quiz mark top left, one centered card, signed-in line with Sign out under it.
Card: h1 "Create your company", Company name, First job role, full-width action.
Components
.card, .field, .input, .btn-accent.btn-block "Create company", .link-btn Sign out.
Error: .banner.banner-alert above the button.
Interaction
Focus on load: h1, Tab to Company name. Enter submits. Build as a form with button type="submit"; the artboard uses a link only to continue the flow.
Create company: creates the org (creator becomes owner) and the first job role, then routes to Overview, empty state.
Error: banner role="alert" "Couldn't create the company…"; both inputs keep their values; focus stays on the button.
2 · Overview

Route: /org/northwind · Artboards: Overview, Overview-Empty, Overview-Preparing, Overview-Loading, Overview-Dark, Overview-1024, Overview-390, Overview-390-Dark

Layout
Full-width .page: h1, five figures in one row, next-step banner, Roles table.
Empty: next-step card (max 720) "Add your first SOP", then Roles. No figures until there is something to count.
Preparing: card "Preparing Warehouse picker training" with progress, then Roles.
390: figures 2-up, the odd last one spans both; table stacks.
Components
.stats.card of a.stat: Employees, Proficient, Avg. days to proficiency, Critical-step errors this week, Documents awaiting review.
.banner "Next step: review 38 new questions…" with the saffron "Review questions".
Empty: saffron "Upload SOP". Preparing: .chip-tint Generating questions, .meter, saffron "Invite people", ghost "Watch the build".
.dt.dt-stack: Role, Training chip, People, Benchmark, Onboarding.
Interaction
Figures are links: Employees and Proficient → People; days → a proficient person; errors → the person with the open error; documents → Questions.
Role name → Role detail. "All roles" → Roles.
Preparing: progress sits in role="status", fed by the Role detail build poll, announced in steps of 5 concepts.
Loading: static skeleton of figures and table (aria-hidden), sr-only status "Loading overview".
Read-only (RO-Overview): next-step banner removed; role links open the read-only Role detail.
3 · Roles

Route: /org/northwind/roles · Artboards: Roles, Roles-New, Roles-Create, Roles-Failed, Roles-Dark

Layout
Page head: h1 + "Create role". One full-width table.
Failed: attention banner above the table.
Create: dialog over the list.
Components
"Create role" is primary; secondary in the new-company state, where the row's Upload SOP link leads.
.dt.dt-stack: Role, Training, Benchmark, Onboarding, People, More actions .icon-btn.
Training: dashed No documents yet + .link-btn Upload SOP; tint Preparing training + "9 of 24 concepts"; plain Ready; strong Training failed.
Dialog: Name; Benchmark .input-suffix % (default 85, 1–100); Onboarding period days (default 30, 1–365); Cancel, primary Create role.
Interaction
Create role opens the dialog, focus on Name. Esc or Cancel returns focus to Create role.
Submit routes to the new role's detail (empty), focus on its h1.
Failed: banner role="alert" "Forklift operator training failed. 2 documents have no selectable text…" + secondary "Fix documents" → Role detail, problems state.
No sort controls; roles in created order.
4 · Role detail

Route: /org/northwind/roles/:roleId · Artboards: RoleDetail, RoleDetail-Uploading, RoleDetail-UploadingLive, RoleDetail-Building, RoleDetail-BuildingLive, RoleDetail-Ready, RoleDetail-Replace, RoleDetail-Paste, RoleDetail-Problems, RoleDetail-Retire, RoleDetail-Edit, RoleDetail-Dark, RoleDetail-1024

Layout
.page-capped. Crumbs Roles › role, h1, meta "Benchmark 85% · Onboarding 30 days · 3 people", actions Edit role + Review questions.
Documents: list card of file rows. An empty role shows the drop zone instead.
Curriculum: units in procedure order, one card each, concepts as rows. Receiving and Picking open on load.
Narrow (1024 and below): concept controls wrap under the text via a container query on .concept-list (<560).
Components
.crumbs; .file-row (.file-ico, .file-title + .tag v3, .file-meta, .file-actions); .dropzone; .meter.
Unit header: h3 › button with number, name, meta "7 concepts · 2 critical", chevron.
.concept-row: name, summary, question state (count, dashed Queued, tint Generating questions, strong Failed + Retry), Critical .switch, Edit .icon-btn.
Saffron moves with the state: Upload PDF (empty), Build curriculum (after upload), Review questions (ready). Never two at once.
Retire dialog: .consequences list, Cancel, .btn-danger "Retire document".
Paste panel: Title, Text .textarea with counter, Cancel, Add text.
Interaction
Upload accepts a PDF up to 10 MB, size checked before sending. Too large: banner role="alert" naming the file and the fix; focus stays.
Uploading: tint Uploading + progressbar "1.5 of 2.4 MB" + Cancel upload. Done: row turns ready in place, status "Picking SOP v3.pdf uploaded. 2 documents ready."
Focus after upload moves to the row's Replace only if it was on Cancel upload.
Dragging a file over the window makes the Documents card the drop target (.dropzone.is-over).
Build curriculum → building (see Model working). Edit is disabled on concepts not done yet.
Failed concept: field-error "Couldn't generate questions…" + Retry (aria-label names the concept) → Generating.
Critical switch saves at once; labelled by the column header + concept name.
Edit: row becomes an inline form (Name, Summary, Critical, Cancel, Save concept); focus to Name; back to the Edit button after.
Paste text: panel toggles (aria-expanded), focus to Title, counter "n / 60,000". Over the limit nothing is cut: field-error role="alert", Add text disabled.
Replace: v4 uploads in the same row; "v3 stays live until v4 is ready."
Extraction failed: .file-row.is-problem, strong chip, field-error, Replace file, Paste text instead, More › Remove.
Retire (More actions): dialog, focus on Cancel, Esc = Cancel, focus returns to "More actions for Returns procedure".
Read-only (RO-RoleDetail): no page or document actions, menus, switches, Edit or Retry; critical concepts show .chip-critical; crumb → Overview.
5 · Question review

Route: /org/northwind/questions?role=warehouse-picker · Artboards: Questions, Questions-Flagged, Questions-Edit, Questions-EditShort, Questions-Dark, RO-Questions

Layout
Full-width .page. Head: h1 + Role select. Toolbar: search, filter chips, status select; results line + Clear filters under it.
Body .review-layout: sticky outline (240px, units › concepts with counts) beside the grouped questions. Outline hides below 1280.
Unit h2 (meta "7 concepts · 105 questions") › concept h3 + Critical chip + counts › one card of compact 56px rows.
Per concept: one row expanded in place into the full card, the rest collapsed, then "Show N more".
Components
Row: status chip (plain Live, strong Flagged by learner, muted Retired or Rejected), review state (dashed Unreviewed or "Approved Oct 30"), stem h4, difficulty, Show details .icon-btn.
Expanded: type line, options A–D with "Correct answer" and per-option feedback, Explanation, source .quote or .quote-none.
Learner flag: .sunken group "Reported by Jordan Reyes · Nov 2, 10:14" + .kv Reason, Note, Attempt.
Actions: ghost Retire, secondary Edit, primary "Approve and next" or "Approve, resolve flag and next". Rejected rows: Edit only.
Edit in place: Type, Difficulty 1–5 (.seg radiogroup), Stem, options with Correct radio + Feedback, or Accepted answers chips for short answer, Explanation, Source document, Section, Source quote.
.filter-chip: Unreviewed 38, Flagged by learners 2, Critical 96.
Interaction
Role select rewrites ?role= and reloads the groups; focus stays on the select.
Filters combine (AND). Results line role="status" ("38 questions"). No match: "No questions match these filters…" + Clear filters.
Show/Hide details: aria-expanded + aria-controls; every row button is described by its stem.
Approve and next: records reviewer and date, collapses the row, expands the next unreviewed one and focuses its stem; status "Approved. 37 unreviewed."
Approve on a flagged question also resolves the flag. Flags never change a learner's progress.
Retire: the question leaves play at once and the row turns muted Retired; it never shows to learners again.
Edit: focus to "Edit question". Save checks the quote against the source text; a miss shows field-error role="alert" "This quote isn't in Picking SOP v3…". Cancel returns focus to Edit.
Outline links jump to the concept; aria-current="location" follows the concept in view.
Read-only (RO-Questions, Flagged filter on): band; Retire, Edit and Approve removed; flags and content stay. Content flags link here.
6 · People

Route: /org/northwind/people · Artboards: People, People-Empty, People-Invite, People-InviteLink, People-Dark, People-1024, People-390, People-390-Dark

Layout
Full-width .page: h1 + saffron "Invite people", toolbar, table, footer count.
Role, onboarding day and last active ride as sub lines so the table fits 1024 without sideways scroll.
Empty: one card "No one invited yet." + Invite people; no table, no toolbar.
390: rows stack; name full width, status and progress below.
Components
Toolbar: search (name or email), Job role select, .filter-chip Invited, Active, Proficient, Expired with counts.
.dt.dt-stack: Name, Status, Progress to benchmark (.progress-cell: .bar + .bar-bench + %), Open critical errors, actions.
Status: plain Active, .chip-mastered Proficient, dashed Invited, muted Expired; "Not joined" in .null.
Invite dialog (.dialog-wide): fieldset per person (Name, Email, Job role), Add another person, Cancel, Create invite links.
Link dialog: .qr at 288px, readonly link input, primary Copy link, "Joins as Warehouse picker · Expires Nov 9 · Works once", ghost Revoke link, Done.
Interaction
Alphabetical. No sort controls and no column that ranks people; the caption says the order.
Chips filter one status (aria-pressed); footer role="status" "1 of 4 people".
Joined people's names link to Training progress; invited and expired rows have no link.
Row menus: Invited › Show invite link, Revoke. Expired › Create new link, Remove.
Invite: focus to the first Name; Add another person appends a fieldset and focuses its Name. Create invite links → link dialog, one link per person.
Copy link writes the clipboard; status "Link copied".
Revoke link acts at once: QR fades, Copy link aria-disabled, status "Link revoked · Undo". No confirm step.
Done or Esc closes; focus returns to the opener (Invite people or the row's More actions).
Bars are aria-hidden; the % reads "42% of 85% benchmark".
7 · Training progress

Route: /org/northwind/people/:userId · Artboards: Person, Person-Proficient, Person-NotStarted, Person-Dark

Layout
.page-capped. Crumbs People › name, h1 "Training progress", person line, "Jordan sees this same page in the app."
Benchmark card and Weekly trend side by side (auto-fit, min 320), then By unit, then Confident errors and Flags side by side.
Not started: benchmark card only, "Day 1 of 30 · Benchmark 85%". No figures, no zeros.
Components
.t-display %, .bar.bar-lg progressbar with .bar-bench, facts "Day 9 of 30 · Projected: Nov 20 · Sessions: 2 this week · 9 total".
svg.chart: mastery .s1, projection .proj, benchmark .bench, .legend, sr-only weekly table.
By unit: concept bar measured (.bar-fill) or placement estimate (.bar-est, "~30%"); Mastered, Still learning, Placement estimate or "Not started"; .chip-critical.
Confident errors (.rows, at most five): dashed Awaiting correction or plain "Corrected Oct 31".
Flags: dashed Open, reason, concept, .link-btn "Open in Questions".
Interaction
Read-only for partners; same evidence the employee sees. No edit, sort or comparison controls.
Unit rows are disclosure buttons (aria-expanded); Receiving open on load.
"Open in Questions" → the flagged question. "Flags never change progress." sits under the list.
Proficient: chip and date reached. A unit added later (Returns, "Added Nov 2") does not recompute proficiency.
No polling; data is read on load.
8 · Settings

Route: /org/northwind/settings · Artboards: Settings, Settings-AccentFail, Settings-SaveFail, Settings-Dark

Layout
.page-capped; one form card in three sections split by .divider: Company, Learner app, Learning pushes.
.card-foot: Discard, Save changes.
Components
Company name .input; logo preview + secondary Replace logo + ghost Remove, "PNG, JPEG or WebP · up to 2 MB".
Accent color: hex input, swatch button, "Start quiz" button preview with its contrast ratio.
Timezone .select; Working days .seg toggles (aria-pressed, check icon); Working hours From and To selects.
Interaction
Accent contrast is checked as you type. Below 4.5:1 on white: .is-invalid + field-error role="alert" "1.6:1 on white. Pick a darker color that reaches 4.5:1."
Save changes stays enabled. With an invalid field nothing is sent and focus moves to that field.
Logo type and size are checked before upload; the preview swaps on success.
Discard resets to the last saved values. Pushes go out only inside the working days and hours.
Save fail: see Failed save.
9 · Companies

Route: /admin/companies · Artboards: Companies, Companies-Loading, Companies-Dark, Companies-1024

Layout
Full-width .page: h1 + "8 companies", search toolbar, one table. One page, no pager.
Below 1280: Job roles, Documents and the slug line hide.
Components
.dt with a two-row header: Company, Members, Job roles, Documents, and a "Last 30 days" colgroup (Active learners, Model spend).
.th-sort on every column; default Model spend, descending.
Row: company link + /org/slug sub line, numbers right-aligned, More actions .icon-btn.
Interaction
Search by name or slug as you type (debounced); the count under the h1 updates.
Sort button toggles direction; aria-sort moves to that th only; the caption names the order.
Company name → Company detail.
Loading: see Loading skeletons.
10 · Company detail

Route: /admin/companies/:slug · Artboards: CompanyDetail, CompanyDetail-Dark

Layout
.page-capped: crumbs, logo + h1, meta (slug · created · owner), two key figures and the portal action.
Then Members, Roles, Documents, Model spend by job, stacked.
Components
Saffron "View portal (read only)", the one key action.
Tables: Members (email, membership role, joined, last active), Roles (training chip, concepts, live questions, people), Documents (type, version, uploaded, by, status chip).
.hbar per job with the model id in .code; sr-only table with the total.
Interaction
View portal → /admin/companies/northwind/portal (read-only Overview), focus on its h1.
Tables are plain lists, no row actions.
"—" cells carry sr-only words ("Not joined", "Still generating").
11 · Read-only portal

Route: /admin/companies/:slug/portal + the partner routes under it · Artboards: RO-Overview, RO-Overview-Dark, RO-RoleDetail, RO-Questions

Layout
The partner screens, unchanged in layout, under the staff prefix (/portal, /portal/roles/:roleId, /portal/questions…).
.ro-band 48px, sticky, full width above nav and content; .app.has-band shifts the sticky nav and table heads down 48px.
Components
Band: eye icon, "Read only · You are viewing Northwind Logistics as Learn Quiz staff. Nothing here can be changed.", link "Exit to staff admin".
PortalNav readonly: .ro-pill "Read only" + "Staff view" replace the user and Sign out.
Interaction
Band is role="region" "Read-only view", first in tab order. Exit → Company detail.
Not rendered: page actions, upload, document menus, switches, Edit, Retry, Approve, Retire, next-step banners. Critical shows as a chip.
Reads accept requireStaff; every write requires requireOrgAdmin, so a leaked control still fails.
People, Person and Settings have no read-only artboards; the same rule applies.
12 · Users

Route: /admin/users · Artboards: Users, Users-Ban, Users-Banned, Users-Dark

Layout
Full-width .page: h1, toolbar (search, Global role, Status), table, pager. 25 per page.
Components
.dt: Name + email, Global role (.tag Admin), Company + membership, Status (plain Active, strong Banned + reason), Joined (sorted, newest first), action.
Action: ghost Ban or secondary Unban. Own row: .tag You; Ban aria-disabled with "You can't ban yourself".
Ban dialog: who line, Reason .textarea (required, "Only Learn Quiz staff see this."), consequences, Cancel, .btn-danger "Ban user".
.pager: "1–25 of 214 users", Previous, Next.
Interaction
Search by email or name; any filter change resets to page 1.
Ban opens the dialog with focus on Reason; Esc or Cancel returns focus to that row's Ban.
Ban user signs them out on every device. Banner role="status" "Theo Marsh is banned." + Undo; the row shows Banned + Unban; focus to that Unban.
Unban acts at once, no dialog; the status line confirms.
The server refuses a self-ban whatever the UI shows.
13 · Model usage

Route: /admin/usage · Artboards: ModelUsage, ModelUsage-Dark

Layout
Full-width .page: h1 + range line (times in UTC), date range in page actions.
Four figures; Calls and Cost charts in .grid-2; Latency full width; By job; By company; Latest 50 failures.
Components
Date range: .seg 7, 30, 90 days + secondary button with the custom range (aria-haspopup="dialog").
.stats.card: Calls, Failures (+ % of calls), Latency p95, Cost.
Bar charts (calls with failure-rate strip, cost); line chart p50 solid, p95 dashed, with a Job select. Each: legend, role="img" summary, sr-only table with a total row.
By job: model name + id (.cell-code), totals in tfoot. By company: sortable, Cost descending. Failures: time, job, model, company, error in .code; pager 25 per page.
Interaction
The range drives every figure, chart and table. Preset buttons are aria-pressed; focus stays on the control; the range line under the h1 updates.
Custom range opens a dialog with From and To; Esc returns focus to the button.
Today is partial; captions say so ("Nov 3 counts up to 10:42").
No auto-refresh; the page shows data as of load.
Company names → Company detail.
14 · Generation jobs

Route: /admin/jobs · Artboards: Jobs, Jobs-Retried, Jobs-Dark

Layout
Full-width .page: h1 + "Updated 10:42:15 · refreshes every 5 s" + Pause updates; filter chips; table with bulk bar; pager.
Order: failed first, then generating, then pending in queue order.
Components
.filter-chip: Not ready 19 (default: Failed + Generating + Pending), Failed, Generating, Pending, Ready.
.dt + .col-check: Company · role, Target (concept or document + job type), State, Started, Duration, Error (.code), Retry.
States: strong Failed, tint Generating, dashed Pending, plain Ready.
.bulkbar after selection: "3 selected", saffron "Retry 3 jobs", Clear selection. Selected rows aria-selected (brand-tint).
Interaction
Polls every 5 s. Rows are keyed by job id so focus and selection survive a refresh. The table is not a live region.
Polling pauses while focus is in the table, while any row is selected, and on Pause updates (aria-pressed).
One sr-only role="status" announces only count changes: "3 failed, 4 generating, 12 pending, 389 ready."
Retry (row or bulk) re-queues; banner role="status" "3 jobs queued again." with Dismiss; selection clears; focus to the banner.
StaffNav's failed count follows the same poll.
15 · Content flags

Route: /admin/flags · Artboards: Flags, Flags-Dark

Layout
Full-width .page: h1, toolbar (type chips, Company, Status), one table, newest first.
Components
.filter-chip, single choice: All 9, Reported by learners 5, Retired by partners 4.
.dt: Question (stem link + source · unit), Company, Reason and note, When (sorted, + who), Status (strong Flagged by learner, muted Retired, plain "Resolved Nov 1").
Interaction
Chips and selects filter rows; sr-only status "Showing 5 flags".
Question link → that question in the company's read-only Questions (/admin/companies/:slug/portal/questions).
No actions here; the partner resolves flags in Question review.
16 · Loading skeletons

Any route on first load · Artboards: Overview-Loading, Companies-Loading

Layout
Skeleton keeps the final layout: h1 and nav are real; figures, section heading, table header and rows at their real heights.
Companies keeps the real <thead>, so columns don't jump when rows arrive.
Components
.skel blocks (chip-shaped where a chip will be), .skel-line, .stats.card and .dt-wrap shells.
Interaction
Skeleton is aria-hidden; the table gets aria-busy="true"; one sr-only status ("Loading companies").
Static: no shimmer, no spinner. Content replaces it in place; focus stays on the h1.
17 · Model working

Route: /org/northwind/roles/:roleId · Artboards: RoleDetail-Building, RoleDetail-BuildingLive, Overview-Preparing

Layout
Progress sits in the Curriculum section head. Units fill in as they are found.
Next unit: name + "Finding concepts…" + skeleton lines. Units further out: one skeleton card.
Components
.meter role="progressbar" with aria-valuenow and valuetext "12 of 31 concepts ready".
Concepts: question count when done, .chip-tint Generating questions, .chip-dashed Queued.
Finish: .banner "Curriculum ready · 31 concepts" + primary Review questions.
Interaction
Work runs on the queue (one message per concept), so the partner can leave; status also shows on Overview and Roles.
The page polls job status (BuildingLive simulates one concept per 700 ms). Critical switches stay usable on found concepts.
Announced in steps of 5 ("15 of 31 concepts ready"), then "31 of 31 concepts ready. Curriculum ready." Focus never moves.
18 · Permission denied

Route: any /org/:slug/… without owner or admin, any /admin/… without staff · Artboards: Denied, Denied-Staff, Denied-Dark

Layout
No nav. Learn Quiz mark + one card: h1, one paragraph, one action.
Components
.card, .btn-primary.btn-block.
Portal: "No access to this portal", signed-in email, who to ask (the owner), "Sign in with another account".
Staff: "No access to the staff admin", "Go to your portal".
Interaction
Rendered for a 403 from requireOrgAdmin or requireStaff; the URL stays. Focus on h1.
Always a way out; never "Try again".
19 · Not found

Route: e.g. /org/northwind/roles/:roleId with an unknown id · Artboards: NotFound, NotFound-Dark

Layout
Inside the portal shell, nav with no current item; .page-capped; h1 + one line + two actions.
Components
h1 names the missing thing ("Role not found"); primary Go to Overview, secondary View roles.
Interaction
404 status; focus on h1. Same pattern for a missing person or question, with the matching list as the second action.
20 · Failed save keeps input

Route: /org/northwind/settings, /org/new · Artboards: Settings-SaveFail, CreateCompany-Error

Layout
Banner at the top of the form region: under the h1 on Settings, above the button on Create company.
Components
.banner.banner-alert, alert icon, words first: "Couldn't save your changes. The server didn't respond. Your edits are still in the form." + secondary Try again.
Interaction
role="alert", announced once. Every input keeps its value (the artboard shows the edited name and Saturday on).
Focus stays on the submit button. Try again resends the same values; the banner clears on success.
Open questions
Build progress and Generation jobs: poll (3 to 5 s, as designed) or server-sent events from the Worker? Polling is simpler on Workers; SSE removes the delay.
Retiring the last source of a concept: today the dialog warns and the concept leaves training. Should it block instead, or ask for a replacement document first?
Invite links: 7 days and single use as designed? Does "Create new link" invalidate the old link?
Should opening a company's portal read-only write an audit entry (staff user, company, time), and should the partner see it?
What counts as a "document awaiting review": any document with Unreviewed questions, or only a new version since the last review? Overview shows 1 (Returns procedure).
"Approve and next" order: outline order, or critical concepts first?
Critical switch saves at once. Should changing it trigger anything (question priority, critical-error tracking from that day), and does it need an undo?
Model usage custom range: maximum span, and is UTC right for staff, or should each company's figures follow its timezone?

## Design-system additions

Admin design-system additions
Status colors
Decision

No new semantic error or warning color. Red, green and amber stay reserved for answer feedback and mastery.

Training failed
chip-strong · needs a person

Couldn't build training. Retry, or replace Picking SOP v3.

banner-alert · sunken ground, strong border, words first
Benchmark
%

Enter a number from 50 to 100.

Field error · 2px ink border, icon, words

Tokens: surface-inverse, on-inverse, surface-sunken, border-strong, ink · A11y: words carry the state, icon repeats it; role="alert" for blocking errors; 2px ink border clears 3:1 in both themes.

Proposed, not adopted: attention token

If usability testing shows failures are missed, propose a single "attention" token reviewed against answer feedback. Not used in these screens.

Status chip set
Status chips by emphasis level
Group	Class · treatment	Statuses
Not yet	.chip-dashed
Dashed border-strong
	
Invited
Queued
Pending
Unreviewed
No documents yet

In motion	.chip-tint
brand-tint ground, brand icon
	
Uploading
Preparing training
Generating questions
Building curriculum

Settled	.chip
1px border-strong, card ground
	
Active
Ready
Done
Live
Approved

Needs a person	.chip-strong
surface-inverse ground, on-inverse text
	
Failed
Training failed
Extraction failed
Flagged by learner
Banned

Out of play	.chip-muted
Sunken ground, ink-muted text
	
Retired
Expired
Revoked
Rejected

Mastery	.chip-mastered · .chip-learning · .chip-critical
The only chips allowed feedback colors
	
Proficient
Still learning
Estimate
Critical

Icon + word always. Never the feedback icons on operational chips.

Tokens: border-strong, brand-tint + brand, surface-inverse + on-inverse, surface-sunken + ink-muted, feedback-* (mastery only) · 28px, radius-full, 13/18 600 · A11y: the word is the state, icons aria-hidden; emphasis by shape and ground, never hue alone.

Side navigation
Northwind Logistics
Overview
Roles
Questions
People
Settings
DW
Dana Whitaker
Owner
Learn Quiz
≥1024 · 248px · Roles hover · People current · Settings focus
Northwind Logistics
Overview
Roles
Questions
People
Settings
DW
Dana Whitaker
Owner
Below 1024 · top bar 56px · menu open, same five items as a sheet
Learn Quiz
Staff admin
Staff variant header · desktop only

Tokens: nav-w 248, topbar-h 56, target 44, surface-page (hover), brand-tint (current), brand (current icon, focus) · company logo only, portal stays petrol · A11y: nav aria-label with the company name; aria-current="page"; menu button aria-expanded + aria-controls; Esc closes the sheet and returns focus to the button.

Data table
Desktop
Search questions
Unreviewed
38
Flagged by learner
2
Critical
96

1 selected

Approve questions
Retire questions
Clear selection
Critical questions, Warehouse picker, sorted by attempts, most first
	Question
	Unit
	Status	Attempts
	First-try correct
	
Actions


	The scanner beeps twice. What do you do?	Scanning	
Live	52	64%	
Approve
Edit question
Open source document
Retire


	Who lifts a 30 kg carton?	Safety	
Live	44	82%	


	What do you check before taking an item from a slot?	Picking	
Live	38	71%	


	A pallet arrives with a crushed corner. When do you report it?	Receiving	
Flagged by learner	29	48%	


	When can a return be refunded?	Returns	
Unreviewed	0	—
No attempts yet
	

1–25 of 96

Previous
Next

Filter chips off / focus / on (aria-pressed, count in the name) · Attempts sorted descending · row 2 hover · row 4 selected · More actions open on row 1 (.menu-anchor) · Tokens: row-hover, brand-tint, border-strong header rule, row 56 · A11y: caption + th scope; sort button in th, aria-sort on that column only; checkboxes name their row; "1 selected" role="status"; menu arrows move, Esc closes and returns focus.

Below 640: stacked
Critical questions, stacked
Question	Actions	Unit	Status	Attempts	First-try correct
A pallet arrives with a crushed corner. When do you report it?
Unit
Receiving
Status
Flagged by learner
Attempts
29
First-try correct
48%
When can a return be refunded?
Unit
Returns
Status
Unreviewed
Attempts
0
First-try correct
—

1–25 of 96

Real table.dt.dt-stack; the <640 rules are copied inline because the media query can't fire at 1440 (labels drawn as spans where data-label::before would be) · A11y: thead visually hidden, not removed; row actions stay visible.

Sticky header
Critical concepts, Warehouse picker
Critical concept	Unit
Report damaged pallets before put-away	Receiving
Confirm the location label before picking	Picking
Double beep: put the item back and re-scan	Scanning
Keep pedestrian lanes clear	Safety
Two-person lift above 23 kg	Safety
Refund only after inspection	Returns

Scroll the box: th stays put (position: sticky). In the app it sticks under the read-only band (48px) and the top bar (56px) · A11y: scroll region is focusable and labelled.

Loading

Loading questions

Question	Status	Attempts

	
	


	
	


	
	

Skeleton rows in table shape under the real header · .skel-line · no spinner · A11y: skeleton aria-hidden, "Loading questions" in role="status".

No results for these filters
Questions, filtered
Question	Status	Attempts

No questions are both Unreviewed and Flagged by learner.

Clear filters

Names the filters, one way out · not the first-run empty state · A11y: Clear filters returns focus to the search field.

File upload
Dropzone

Drop a PDF here

Selectable text · up to 10 MB

Choose file
Idle

Release to upload

Selectable text · up to 10 MB

Choose file
Drag-over · .is-over

Tokens: 2px dashed border-strong on surface-page; brand + brand-tint when over or focus-within · A11y: drag is optional, "Choose file" is a real button; the zone is not a focus stop.

Pasted text
Title
Text
6,240 / 60,000
Add text
Cancel

Counter tabular, limit 60,000 · A11y: counter in aria-describedby, announced politely at 90% and at the limit; over the limit becomes a field error.

File rows

Picking SOP v3.pdf
Uploading

1.1 of 2.4 MB

Cancel upload
Uploading · meter + bytes

Couldn't add Forklift manual.pdf (14.2 MB). Larger than 10 MB. Split it or export a smaller PDF.

Rejected before upload · banner-alert

Receiving checklist.pdf
Extraction failed

No selectable text found. This looks like a scan. Upload a PDF with text, or paste the text.

Paste text
Remove
Extraction failed · is-problem + chip-strong + what to do

Picking SOP v3
Ready

PDF · 2.4 MB · 18 pages · Version 3 · Oct 28, 2026 · Dana Whitaker

Replace

Returns procedure
Ready

Pasted text · 6,240 characters · Version 1 · Nov 2, 2026 · Dana Whitaker

Replace
Done · title, type, size, version, date, uploader

Tokens: meter 4px brand on surface-sunken; is-problem = surface-sunken row · A11y: role="progressbar" with aria-valuetext in MB, progress in role="status" every 25%; rejected and failed messages are role="alert" and say what to do.

Stat figure
Employees
3
Avg. days to proficiency
21days
Avg. days to proficiency
—
No data yet.
No one has reached the benchmark yet
Critical-step errors this week
1

Normal

With unit

No data yet · never a fake 0

Loading

As a link · hover

Tokens: stat-value 32/40 700 tabular, label 14/20 ink-muted, unit 15/22, 1px dividers, surface-page hover; the label names the thing and its window · A11y: label before value; "—" carries sr text "No data yet"; skeleton aria-hidden.

Charts

2px strokes · dash 6/4 second series · 4/4 benchmark · brand, ink, ink-muted only · never saffron or feedback colors

Line chart

Weekly mastery · Jordan Reyes

Mastery
Projected
Benchmark 85%
0%
50%
100%
85%
18%
42%
Nov 20
Oct 26
Nov 2
Nov 9
Nov 16
Nov 20
Weekly mastery, Jordan Reyes, benchmark 85%
Week of	Mastery
Oct 26	18%
Nov 2 (so far)	42%
Nov 20 (projected)	85%

Tokens: s1 brand 2px, proj brand 6/6, bench ink 2px 4/4, grid border, dot brand, dot-open card + brand · A11y: role="img" one-sentence summary + sr-only table; series by dash, legend and direct labels.

Bar chart

Model calls by day · Oct 21 – Nov 3

Calls
Today, so far
0
250
500
750
1,000
21
22
23
24
25
26
27
28
29
30
31
1
2
3
898
342
Oct
Nov
Today
Model calls by day, Oct 21 to Nov 3, 2026
Day	Calls
Oct 21	738
Oct 22	721
Oct 23	675
Oct 24	415
Oct 25	371
Oct 26	714
Oct 27	732
Oct 28	749
Oct 29	898
Oct 30	798
Oct 31	436
Nov 1	368
Nov 2	760
Nov 3 (today, so far)	342

Tokens: s1-fill brand, radius 2; today's partial day outlined (card fill, 2px brand); direct labels on the peak and today only · A11y: summary states total, range and peak; sr-only table lists all 14 days, today marked "so far".

Horizontal bar list

Model calls by job · Oct 21 – Nov 3

Grading
4,412
Questions
2,508
Explanations
1,561
Curriculum
236
Model calls by job, Oct 21 to Nov 3, 2026
Job	Calls
Grading	4,412
Questions	2,508
Explanations	1,561
Curriculum	236

Tokens: hbar-track 12px surface-sunken, fill brand, .hbar-val 600 tabular right-aligned; sorted by value · A11y: role="img" with the full list in its label, plus the sr-only table.

Date range filter
7 days
30 days
90 days
Oct 5 – Nov 3, 2026
Closed · presets + custom range · one range drives every chart on the page

Tokens: popover = .menu ground + shadow-raised; range brand-tint; ends brand + on-brand; days after today ink-muted, no box · A11y: trigger aria-haspopup="dialog" + aria-expanded; each month is a role="grid" with one tab stop (roving tabindex), arrows move by day, Page Up/Down by month; each day names its full date; Apply commits, Esc cancels, focus returns to the trigger.

Oct 5 – Nov 3, 2026

October 2026

Su	Mo	Tu	We	Th	Fr	Sa
				1	2	3
4	5	6	7	8	9	10
11	12	13	14	15	16	17
18	19	20	21	22	23	24
25	26	27	28	29	30	31

November 2026

Su	Mo	Tu	We	Th	Fr	Sa
1	2	3	4	5	6	7
8	9	10	11	12	13	14
15	16	17	18	19	20	21
22	23	24	25	26	27	28
29	30					

Oct 5 – Nov 3 · 30 days

Cancel
Apply
Open · two months · range in brand-tint, start and end in brand · days after today ink-muted text, no box
Confirmation dialog

Destructive = solid ink, never red. Focus starts on Cancel. Esc closes. Focus returns to the opener.

Consequences

Retire Picking SOP v3?

Its questions leave play. Learners stop seeing them today.
New questions are generated from the documents that remain.
Cancel
Retire document

Title names the object; one line per consequence; button repeats verb + object · Tokens: scrim, radius-lg, shadow-raised, btn-danger = surface-inverse + on-inverse · A11y: role="dialog" aria-modal aria-labelledby; focus trapped; Cancel focused on open.

Required reason

Ban Theo Marsh?

Theo is signed out and can't sign in until unbanned.
Reason · required

Enter a reason. Other staff see it in the user list.

Cancel
Ban user

Shown after "Ban user" with an empty reason · A11y: the button stays enabled; on press, focus moves to the field and the error is announced; aria-required + aria-invalid + aria-describedby.

Banners and forms
Read-only band

Sticky on every staff-viewed portal screen. Every edit control removed, not disabled.

Read only · You are viewing Northwind Logistics as Learn Quiz staff.
Exit to staff admin
Read only
Learn Quiz staff

Nav foot pill replaces the user row · Tokens: surface-inverse + on-inverse, 48px, z-index 10, ro-pill border-strong · A11y: role="region" aria-label="Read-only view", first in reading order; exit link 44px with an on-inverse focus ring.

Banners

Next step: review 38 new questions from Returns procedure.

Review questions

Couldn't save settings. Your changes are still here. Check your connection and save again.

Save again

Info: brand-tint, may hold the screen's one saffron action · Alert: surface-sunken + 1px border-strong + ink icon, role="alert", what happened then what to do · no stripes.

Field error
Accent color

Too light on white (1.6:1). Pick a darker color that reaches 4.5:1.

2px ink border (padding drops 1px so text holds still), 14/20 600 message · A11y: aria-invalid + aria-describedby; focus moves to the first invalid field.

Buttons
Build curriculum
Retire document

Disabled: sunken + 2px dashed border-strong, never faded · Danger: surface-inverse + on-inverse, dialogs only · both clear 4.5:1 in both themes.

Curriculum and review helpers
Concept row

Receiving

7 concepts

Questions
Critical
Check the delivery against the ASN
Match carrier, PO number and pallet count before signing.
16
Report damaged pallets before put-away
Photograph the damage, tag the pallet and log it in the WMS.
15

As shipped in Role detail: header row "Questions" / "Critical", plain question count, unlabelled switch, pencil Edit · .concept-list / .concept-row / .concept-controls; controls drop under the text below 560px (container query) · A11y: each switch is labelled by "Critical" + the concept name; Edit names the concept.

Review outline
Receiving
Picking
Scanning
Safety
Returns
38

.review-layout 240px outline + content; outline hides under 1280 · count = unreviewed.

Also added: .menu-anchor / .opens-up (row menus), .dt-hide-lg (low-priority columns under 1280), .null (muted "—"), .skel-line, .cell-code (ids, model names), .dt tfoot td (totals), .rows-compact (48px list rows), .hbar-val.

Added tokens
Tokens added for admin, light and dark values
Token	Light	Dark	Use

surface-inverse
	#14181F	#ECEEF1	Read-only band, chip-strong, btn-danger

on-inverse
	#F7F6F2	#121417	Text and icons on surface-inverse

scrim
	rgba(20,24,31,0.48)	rgba(0,0,0,0.6)	Behind dialogs (as the learner app)

row-hover
	#F7F6F2	#20252B	Table row hover
target	44px	44px	Minimum control size
nav-w	248px	248px	Side nav at 1024 and up
content-max	1120px	1120px	Forms, profiles, detail. Tables and charts fill the column.
topbar-h	56px	56px	Top bar below 1024
Layout rules
≥ 1024
Side nav 248px + content column · 32px page padding.
640–1023
Top bar 56px + menu sheet · content full width.
< 640
Single column · 16px gutters · tables stack · stats 2-up · dialogs become bottom sheets.
Width
Forms, profiles and detail cap at 1120px. Tables and charts fill the content column.
Emphasis
One accent per screen, at most. One primary per region. Staff admin is desktop only.

## Flow

Learn Quiz admin

Partner portal and staff admin · Northwind Logistics demo · Nov 3, 2026

Partner flow
Start
1
Create company
2
Overview, new company
3
Roles
4
Role detail, no documents
5
Upload SOP
6
Curriculum building
7
Curriculum ready
8
Question review
9
People
10
Invite with QR code
11
Training progress
Staff flow
Start
1
Companies
2
Company detail
3
Portal, read only
4
Model usage
5
Generation jobs, retry
6
Users, ban
7
Content flags
Reference
Design-system additions
Handoff notes
Loading
Permission denied
Not found
Failed save
