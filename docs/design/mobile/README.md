# Learner app design (phone)

The design for the learner screens of the Android app (`apps/mobile`) and the web app (`apps/web`). It follows the design system in [`../design-system.md`](../design-system.md).

- `source/`: the design source. One `<Screen>.dc.html` per artboard; shared styles in `source/lq.css`; tokens in `source/tokens.json`; board order and titles in `source/canvas.json`. Dark, white-label and state artboards are small files that import a base screen with props (`theme`, `brand`, `state`, `variant`, `step`, `scroll`).
- `screens/`: each artboard rendered at 2x (base frame 360 x 740 CSS px). `<Screen>.png` is light, `<Screen>-dark.png` dark, `-scrolled` the bottom of a screen that scrolls.
- [`HANDOFF.md`](HANDOFF.md): per-screen handoff notes, global rules and the design-system additions.


## 1. Join and first sign-in

| Artboard | Source | Screenshots |
|---|---|---|
| Join by invite | [`Main.dc.html`](source/Main.dc.html) | [`Main-scrolled.png`](screens/Main-scrolled.png), [`Main.png`](screens/Main.png) |
| First sign-in disclosure | [`Disclosure.dc.html`](source/Disclosure.dc.html) | [`Disclosure.png`](screens/Disclosure.png) |
| Join by invite · dark | [`MainDark.dc.html`](source/MainDark.dc.html) | [`Main-dark-scrolled.png`](screens/Main-dark-scrolled.png), [`Main-dark.png`](screens/Main-dark.png) |
| Disclosure · dark | [`DisclosureDark.dc.html`](source/DisclosureDark.dc.html) | [`Disclosure-dark.png`](screens/Disclosure-dark.png) |

## 2. Today

| Artboard | Source | Screenshots |
|---|---|---|
| Today · normal day | [`Today.dc.html`](source/Today.dc.html) | [`Today.png`](screens/Today.png) |
| Today · white-label (plum) | [`TodayPlum.dc.html`](source/TodayPlum.dc.html) | [`TodayPlum.png`](screens/TodayPlum.png) |
| Today · first day | [`TodayFirst.dc.html`](source/TodayFirst.dc.html) | [`TodayFirst.png`](screens/TodayFirst.png) |
| Today · all done | [`TodayDone.dc.html`](source/TodayDone.dc.html) | [`TodayDone.png`](screens/TodayDone.png) |
| Today · content still generating | [`TodayGenerating.dc.html`](source/TodayGenerating.dc.html) | [`TodayGenerating.png`](screens/TodayGenerating.png) |
| Today · 390 × 844 | [`Today390.dc.html`](source/Today390.dc.html) | [`Today390.png`](screens/Today390.png) |
| Today · dark | [`TodayDark.dc.html`](source/TodayDark.dc.html) | [`Today-dark.png`](screens/Today-dark.png) |
| Today · plum · dark | [`TodayPlumDark.dc.html`](source/TodayPlumDark.dc.html) | [`TodayPlum-dark.png`](screens/TodayPlum-dark.png) |
| Today · first day · dark | [`TodayFirstDark.dc.html`](source/TodayFirstDark.dc.html) | [`TodayFirst-dark.png`](screens/TodayFirst-dark.png) |
| Today · all done · dark | [`TodayDoneDark.dc.html`](source/TodayDoneDark.dc.html) | [`TodayDone-dark.png`](screens/TodayDone-dark.png) |
| Today · generating · dark | [`TodayGeneratingDark.dc.html`](source/TodayGeneratingDark.dc.html) | [`TodayGenerating-dark.png`](screens/TodayGenerating-dark.png) |

## 3. Session: question formats

| Artboard | Source | Screenshots |
|---|---|---|
| Question · multiple choice | [`QChoice.dc.html`](source/QChoice.dc.html) | [`QChoice.png`](screens/QChoice.png) |
| Question · multi-select | [`QMulti.dc.html`](source/QMulti.dc.html) | [`QMulti.png`](screens/QMulti.png) |
| Question · cloze, keyboard open | [`QCloze.dc.html`](source/QCloze.dc.html) | [`QCloze.png`](screens/QCloze.png) |
| Question · short answer, voice | [`QVoice.dc.html`](source/QVoice.dc.html) | [`QVoice.png`](screens/QVoice.png) |
| Question · order the steps | [`QOrder.dc.html`](source/QOrder.dc.html) | [`QOrder.png`](screens/QOrder.png) |
| Question · procedure diagram | [`QImage.dc.html`](source/QImage.dc.html) | [`QImage.png`](screens/QImage.png) |
| Multiple choice · dark | [`QChoiceDark.dc.html`](source/QChoiceDark.dc.html) | [`QChoice-dark.png`](screens/QChoice-dark.png) |
| Multi-select · dark | [`QMultiDark.dc.html`](source/QMultiDark.dc.html) | [`QMulti-dark.png`](screens/QMulti-dark.png) |
| Cloze · dark | [`QClozeDark.dc.html`](source/QClozeDark.dc.html) | [`QCloze-dark.png`](screens/QCloze-dark.png) |
| Voice · dark | [`QVoiceDark.dc.html`](source/QVoiceDark.dc.html) | [`QVoice-dark.png`](screens/QVoice-dark.png) |
| Order · dark | [`QOrderDark.dc.html`](source/QOrderDark.dc.html) | [`QOrder-dark.png`](screens/QOrder-dark.png) |
| Diagram · dark | [`QImageDark.dc.html`](source/QImageDark.dc.html) | [`QImage-dark.png`](screens/QImage-dark.png) |

## 4. Reveal

| Artboard | Source | Screenshots |
|---|---|---|
| Reveal · correct, sure | [`Reveal.dc.html`](source/Reveal.dc.html) | [`Reveal.png`](screens/Reveal.png) |
| Reveal · correct, unsure | [`RevealUnsure.dc.html`](source/RevealUnsure.dc.html) | [`RevealUnsure.png`](screens/RevealUnsure.png) |
| Reveal · not quite | [`RevealNotQuite.dc.html`](source/RevealNotQuite.dc.html) | [`RevealNotQuite.png`](screens/RevealNotQuite.png) |
| Reveal · sure and wrong, critical | [`RevealSureWrong.dc.html`](source/RevealSureWrong.dc.html) | [`RevealSureWrong-scrolled.png`](screens/RevealSureWrong-scrolled.png), [`RevealSureWrong.png`](screens/RevealSureWrong.png) |
| Reveal · no source quote | [`RevealNoSource.dc.html`](source/RevealNoSource.dc.html) | [`RevealNoSource.png`](screens/RevealNoSource.png) |
| Report this question | [`Report.dc.html`](source/Report.dc.html) | [`Report.png`](screens/Report.png) |
| Correct, sure · dark | [`RevealDark.dc.html`](source/RevealDark.dc.html) | [`Reveal-dark.png`](screens/Reveal-dark.png) |
| Correct, unsure · dark | [`RevealUnsureDark.dc.html`](source/RevealUnsureDark.dc.html) | [`RevealUnsure-dark.png`](screens/RevealUnsure-dark.png) |
| Not quite · dark | [`RevealNotQuiteDark.dc.html`](source/RevealNotQuiteDark.dc.html) | [`RevealNotQuite-dark.png`](screens/RevealNotQuite-dark.png) |
| Sure and wrong · dark | [`RevealSureWrongDark.dc.html`](source/RevealSureWrongDark.dc.html) | [`RevealSureWrong-dark-scrolled.png`](screens/RevealSureWrong-dark-scrolled.png), [`RevealSureWrong-dark.png`](screens/RevealSureWrong-dark.png) |
| No source · dark | [`RevealNoSourceDark.dc.html`](source/RevealNoSourceDark.dc.html) | [`RevealNoSource-dark.png`](screens/RevealNoSource-dark.png) |
| Report · dark | [`ReportDark.dc.html`](source/ReportDark.dc.html) | [`Report-dark.png`](screens/Report-dark.png) |

## 5. After the session: summary, pushes, quick session

| Artboard | Source | Screenshots |
|---|---|---|
| Session summary | [`Summary.dc.html`](source/Summary.dc.html) | [`Summary-scrolled.png`](screens/Summary-scrolled.png), [`Summary.png`](screens/Summary.png) |
| Push opt-in · Android | [`OptIn.dc.html`](source/OptIn.dc.html) | [`OptIn.png`](screens/OptIn.png) |
| Push opt-in · iOS, add to Home Screen first | [`OptInIOS.dc.html`](source/OptInIOS.dc.html) | [`OptInIOS.png`](screens/OptInIOS.png) |
| Push · Android lock screen | [`PushLock.dc.html`](source/PushLock.dc.html) | [`PushLock.png`](screens/PushLock.png) |
| Push · heads-up | [`PushHeadsUp.dc.html`](source/PushHeadsUp.dc.html) | [`PushHeadsUp.png`](screens/PushHeadsUp.png) |
| Quick session · one question | [`QuickQuestion.dc.html`](source/QuickQuestion.dc.html) | [`QuickQuestion.png`](screens/QuickQuestion.png) |
| Quick session · done | [`QuickDone.dc.html`](source/QuickDone.dc.html) | [`QuickDone.png`](screens/QuickDone.png) |
| Summary · dark | [`SummaryDark.dc.html`](source/SummaryDark.dc.html) | [`Summary-dark-scrolled.png`](screens/Summary-dark-scrolled.png), [`Summary-dark.png`](screens/Summary-dark.png) |
| Opt-in · dark | [`OptInDark.dc.html`](source/OptInDark.dc.html) | [`OptIn-dark.png`](screens/OptIn-dark.png) |
| Opt-in iOS · dark | [`OptInIOSDark.dc.html`](source/OptInIOSDark.dc.html) | [`OptInIOS-dark.png`](screens/OptInIOS-dark.png) |
| Quick question · dark | [`QuickQuestionDark.dc.html`](source/QuickQuestionDark.dc.html) | [`QuickQuestion-dark.png`](screens/QuickQuestion-dark.png) |
| Quick done · dark | [`QuickDoneDark.dc.html`](source/QuickDoneDark.dc.html) | [`QuickDone-dark.png`](screens/QuickDone-dark.png) |

## 6. Path, Training progress, Settings

| Artboard | Source | Screenshots |
|---|---|---|
| Path | [`Path.dc.html`](source/Path.dc.html) | [`Path.png`](screens/Path.png) |
| Unit detail · Receiving | [`Unit.dc.html`](source/Unit.dc.html) | [`Unit-scrolled.png`](screens/Unit-scrolled.png), [`Unit.png`](screens/Unit.png) |
| Profile · Training progress | [`Profile.dc.html`](source/Profile.dc.html) | [`Profile-scrolled.png`](screens/Profile-scrolled.png), [`Profile.png`](screens/Profile.png) |
| Settings | [`Settings.dc.html`](source/Settings.dc.html) | [`Settings-scrolled.png`](screens/Settings-scrolled.png), [`Settings.png`](screens/Settings.png) |
| Path · dark | [`PathDark.dc.html`](source/PathDark.dc.html) | [`Path-dark.png`](screens/Path-dark.png) |
| Unit · dark | [`UnitDark.dc.html`](source/UnitDark.dc.html) | [`Unit-dark-scrolled.png`](screens/Unit-dark-scrolled.png), [`Unit-dark.png`](screens/Unit-dark.png) |
| Training progress · dark | [`ProfileDark.dc.html`](source/ProfileDark.dc.html) | [`Profile-dark-scrolled.png`](screens/Profile-dark-scrolled.png), [`Profile-dark.png`](screens/Profile-dark.png) |
| Settings · dark | [`SettingsDark.dc.html`](source/SettingsDark.dc.html) | [`Settings-dark-scrolled.png`](screens/Settings-dark-scrolled.png), [`Settings-dark.png`](screens/Settings-dark.png) |

## 7. System states

| Artboard | Source | Screenshots |
|---|---|---|
| Offline | [`TodayOffline.dc.html`](source/TodayOffline.dc.html) | [`TodayOffline-scrolled.png`](screens/TodayOffline-scrolled.png), [`TodayOffline.png`](screens/TodayOffline.png) |
| Loading · preparing the session | [`Loading.dc.html`](source/Loading.dc.html) | [`Loading.png`](screens/Loading.png) |
| Error inside a session | [`QError.dc.html`](source/QError.dc.html) | [`QError.png`](screens/QError.png) |
| Empty · Training progress before session 1 | [`ProfileEmpty.dc.html`](source/ProfileEmpty.dc.html) | [`ProfileEmpty.png`](screens/ProfileEmpty.png) |
| Offline · dark | [`TodayOfflineDark.dc.html`](source/TodayOfflineDark.dc.html) | [`TodayOffline-dark-scrolled.png`](screens/TodayOffline-dark-scrolled.png), [`TodayOffline-dark.png`](screens/TodayOffline-dark.png) |
| Loading · dark | [`LoadingDark.dc.html`](source/LoadingDark.dc.html) | [`Loading-dark.png`](screens/Loading-dark.png) |
| Error · dark | [`QErrorDark.dc.html`](source/QErrorDark.dc.html) | [`QError-dark.png`](screens/QError-dark.png) |
| Empty · dark | [`ProfileEmptyDark.dc.html`](source/ProfileEmptyDark.dc.html) | [`ProfileEmpty-dark.png`](screens/ProfileEmpty-dark.png) |

## 2. Today

| Artboard | Source | Screenshots |
|---|---|---|
| Today · back to basics | [`TodayBasics.dc.html`](source/TodayBasics.dc.html) | [`TodayBasics.png`](screens/TodayBasics.png) |
| Back to basics · dark | [`TodayBasicsDark.dc.html`](source/TodayBasicsDark.dc.html) | [`TodayBasics-dark.png`](screens/TodayBasics-dark.png) |

## 3. Session: question formats

| Artboard | Source | Screenshots |
|---|---|---|
| Voice · recording | [`QVoiceRecording.dc.html`](source/QVoiceRecording.dc.html) | [`QVoiceRecording.png`](screens/QVoiceRecording.png) |

## 4. Reveal

| Artboard | Source | Screenshots |
|---|---|---|
| Reveal · partly right (multi-select) | [`RevealPartial.dc.html`](source/RevealPartial.dc.html) | [`RevealPartial.png`](screens/RevealPartial.png) |
| Partly right · dark | [`RevealPartialDark.dc.html`](source/RevealPartialDark.dc.html) | [`RevealPartial-dark.png`](screens/RevealPartial-dark.png) |

## 6. Path, Training progress, Settings

| Artboard | Source | Screenshots |
|---|---|---|
| Unit · procedure diagram | [`UnitDiagram.dc.html`](source/UnitDiagram.dc.html) | [`UnitDiagram-scrolled.png`](screens/UnitDiagram-scrolled.png), [`UnitDiagram.png`](screens/UnitDiagram.png) |
| Training progress · critical errors | [`ProfileErrors.dc.html`](source/ProfileErrors.dc.html) | [`ProfileErrors-scrolled.png`](screens/ProfileErrors-scrolled.png), [`ProfileErrors.png`](screens/ProfileErrors.png) |

## 8. Design-system additions and handoff

| Artboard | Source | Screenshots |
|---|---|---|
| Design-system additions | [`DSAdditions.dc.html`](source/DSAdditions.dc.html) | [`DSAdditions.png`](screens/DSAdditions.png) |
| Handoff notes | [`Handoff.dc.html`](source/Handoff.dc.html) |  |
