# Admin design (partner portal and staff admin)

The design for the partner portal (`/org/...`) and the staff admin (`/admin/...`) of the web app (`apps/web`). It follows the design system in [`../design-system.md`](../design-system.md).

- `source/`: the design source. One `<Screen>.dc.html` per artboard; shared styles in `source/admin.css`; tokens in `source/tokens.json`; board order and titles in `source/canvas.json`. Dark, 1024, 390, read-only and state artboards are small files that import a base screen with props (`theme`, `state`, `readonly`, `live`, `active`, `failed`).
- `screens/`: each artboard rendered at 1x (1440 px wide for the 1440 frames, 1024 and 390 likewise), 256-colour PNGs. Base frames are 1440 x 900 and 1024 desktop and 390 phone, light and dark. `<Screen>.png` is the whole artboard; very tall boards also have `<Screen>-tile-NN.png` slices (2000 CSS px each).
- [`HANDOFF.md`](HANDOFF.md): per-screen handoff notes, the flow and the design-system additions.

## Partner portal

### Start

| Artboard | Source | Screenshots |
|---|---|---|
| Start here | [`Main.dc.html`](source/Main.dc.html) | [`Main.png`](screens/Main.png) |

### Create company

| Artboard | Source | Screenshots |
|---|---|---|
| Create company | [`CreateCompany.dc.html`](source/CreateCompany.dc.html) | [`CreateCompany.png`](screens/CreateCompany.png) |
| Create company · save failed | [`CreateCompany-Error.dc.html`](source/CreateCompany-Error.dc.html) | [`CreateCompany-Error.png`](screens/CreateCompany-Error.png) |
| Create company · dark | [`CreateCompany-Dark.dc.html`](source/CreateCompany-Dark.dc.html) | [`CreateCompany-Dark.png`](screens/CreateCompany-Dark.png) |

### Overview

| Artboard | Source | Screenshots |
|---|---|---|
| Overview · new company | [`Overview-Empty.dc.html`](source/Overview-Empty.dc.html) | [`Overview-Empty.png`](screens/Overview-Empty.png) |
| Overview | [`Overview.dc.html`](source/Overview.dc.html) | [`Overview.png`](screens/Overview.png) |
| Overview · role preparing | [`Overview-Preparing.dc.html`](source/Overview-Preparing.dc.html) | [`Overview-Preparing.png`](screens/Overview-Preparing.png) |
| Overview · loading | [`Overview-Loading.dc.html`](source/Overview-Loading.dc.html) | [`Overview-Loading.png`](screens/Overview-Loading.png) |
| Overview · dark | [`Overview-Dark.dc.html`](source/Overview-Dark.dc.html) | [`Overview-Dark.png`](screens/Overview-Dark.png) |
| Overview · 1024 | [`Overview-1024.dc.html`](source/Overview-1024.dc.html) | [`Overview-1024.png`](screens/Overview-1024.png) |
| Overview · 390 | [`Overview-390.dc.html`](source/Overview-390.dc.html) | [`Overview-390.png`](screens/Overview-390.png) |
| Overview · 390 · dark | [`Overview-390-Dark.dc.html`](source/Overview-390-Dark.dc.html) | [`Overview-390-Dark.png`](screens/Overview-390-Dark.png) |

### Roles

| Artboard | Source | Screenshots |
|---|---|---|
| Roles · new company | [`Roles-New.dc.html`](source/Roles-New.dc.html) | [`Roles-New.png`](screens/Roles-New.png) |
| Roles | [`Roles.dc.html`](source/Roles.dc.html) | [`Roles.png`](screens/Roles.png) |
| Roles · create role | [`Roles-Create.dc.html`](source/Roles-Create.dc.html) | [`Roles-Create.png`](screens/Roles-Create.png) |
| Roles · training failed | [`Roles-Failed.dc.html`](source/Roles-Failed.dc.html) | [`Roles-Failed.png`](screens/Roles-Failed.png) |
| Roles · dark | [`Roles-Dark.dc.html`](source/Roles-Dark.dc.html) | [`Roles-Dark.png`](screens/Roles-Dark.png) |

### Role detail

| Artboard | Source | Screenshots |
|---|---|---|
| Role detail · no documents | [`RoleDetail.dc.html`](source/RoleDetail.dc.html) | [`RoleDetail.png`](screens/RoleDetail.png) |
| Upload SOP · live | [`RoleDetail-UploadingLive.dc.html`](source/RoleDetail-UploadingLive.dc.html) | [`RoleDetail-UploadingLive.png`](screens/RoleDetail-UploadingLive.png) |
| Upload SOP · in progress | [`RoleDetail-Uploading.dc.html`](source/RoleDetail-Uploading.dc.html) | [`RoleDetail-Uploading.png`](screens/RoleDetail-Uploading.png) |
| Curriculum building · live | [`RoleDetail-BuildingLive.dc.html`](source/RoleDetail-BuildingLive.dc.html) | [`RoleDetail-BuildingLive.png`](screens/RoleDetail-BuildingLive.png) |
| Curriculum building · 12 of 31 | [`RoleDetail-Building.dc.html`](source/RoleDetail-Building.dc.html) | [`RoleDetail-Building.png`](screens/RoleDetail-Building.png) |
| Curriculum ready | [`RoleDetail-Ready.dc.html`](source/RoleDetail-Ready.dc.html) | [`RoleDetail-Ready.png`](screens/RoleDetail-Ready.png) |
| Curriculum ready · dark | [`RoleDetail-Dark.dc.html`](source/RoleDetail-Dark.dc.html) | [`RoleDetail-Dark.png`](screens/RoleDetail-Dark.png) |
| Curriculum ready · 1024 | [`RoleDetail-1024.dc.html`](source/RoleDetail-1024.dc.html) | [`RoleDetail-1024.png`](screens/RoleDetail-1024.png) |

### Role detail · documents and edits

| Artboard | Source | Screenshots |
|---|---|---|
| Replace with new version | [`RoleDetail-Replace.dc.html`](source/RoleDetail-Replace.dc.html) | [`RoleDetail-Replace.png`](screens/RoleDetail-Replace.png) |
| Paste text · over limit | [`RoleDetail-Paste.dc.html`](source/RoleDetail-Paste.dc.html) | [`RoleDetail-Paste.png`](screens/RoleDetail-Paste.png) |
| Rejected file · failed extraction | [`RoleDetail-Problems.dc.html`](source/RoleDetail-Problems.dc.html) | [`RoleDetail-Problems.png`](screens/RoleDetail-Problems.png) |
| Retire document · confirm | [`RoleDetail-Retire.dc.html`](source/RoleDetail-Retire.dc.html) | [`RoleDetail-Retire.png`](screens/RoleDetail-Retire.png) |
| Edit concept inline | [`RoleDetail-Edit.dc.html`](source/RoleDetail-Edit.dc.html) | [`RoleDetail-Edit.png`](screens/RoleDetail-Edit.png) |

### Question review

| Artboard | Source | Screenshots |
|---|---|---|
| Question review | [`Questions.dc.html`](source/Questions.dc.html) | [`Questions.png`](screens/Questions.png) |
| Question review · flagged | [`Questions-Flagged.dc.html`](source/Questions-Flagged.dc.html) | [`Questions-Flagged.png`](screens/Questions-Flagged.png) |
| Edit question · multiple choice | [`Questions-Edit.dc.html`](source/Questions-Edit.dc.html) | [`Questions-Edit.png`](screens/Questions-Edit.png) |
| Edit question · short answer | [`Questions-EditShort.dc.html`](source/Questions-EditShort.dc.html) | [`Questions-EditShort.png`](screens/Questions-EditShort.png) |
| Question review · dark | [`Questions-Dark.dc.html`](source/Questions-Dark.dc.html) | [`Questions-Dark.png`](screens/Questions-Dark.png) |

### People

| Artboard | Source | Screenshots |
|---|---|---|
| People | [`People.dc.html`](source/People.dc.html) | [`People.png`](screens/People.png) |
| Invite people | [`People-Invite.dc.html`](source/People-Invite.dc.html) | [`People-Invite.png`](screens/People-Invite.png) |
| Invite link · QR code | [`People-InviteLink.dc.html`](source/People-InviteLink.dc.html) | [`People-InviteLink.png`](screens/People-InviteLink.png) |
| People · empty | [`People-Empty.dc.html`](source/People-Empty.dc.html) | [`People-Empty.png`](screens/People-Empty.png) |
| People · dark | [`People-Dark.dc.html`](source/People-Dark.dc.html) | [`People-Dark.png`](screens/People-Dark.png) |
| People · 1024 | [`People-1024.dc.html`](source/People-1024.dc.html) | [`People-1024.png`](screens/People-1024.png) |
| People · 390 | [`People-390.dc.html`](source/People-390.dc.html) | [`People-390.png`](screens/People-390.png) |
| People · 390 · dark | [`People-390-Dark.dc.html`](source/People-390-Dark.dc.html) | [`People-390-Dark.png`](screens/People-390-Dark.png) |

### Training progress

| Artboard | Source | Screenshots |
|---|---|---|
| Training progress · Jordan | [`Person.dc.html`](source/Person.dc.html) | [`Person.png`](screens/Person.png) |
| Training progress · proficient | [`Person-Proficient.dc.html`](source/Person-Proficient.dc.html) | [`Person-Proficient.png`](screens/Person-Proficient.png) |
| Training progress · before first session | [`Person-NotStarted.dc.html`](source/Person-NotStarted.dc.html) | [`Person-NotStarted.png`](screens/Person-NotStarted.png) |
| Training progress · dark | [`Person-Dark.dc.html`](source/Person-Dark.dc.html) | [`Person-Dark.png`](screens/Person-Dark.png) |

### Settings

| Artboard | Source | Screenshots |
|---|---|---|
| Settings | [`Settings.dc.html`](source/Settings.dc.html) | [`Settings.png`](screens/Settings.png) |
| Settings · accent fails contrast | [`Settings-AccentFail.dc.html`](source/Settings-AccentFail.dc.html) | [`Settings-AccentFail.png`](screens/Settings-AccentFail.png) |
| Settings · save failed | [`Settings-SaveFail.dc.html`](source/Settings-SaveFail.dc.html) | [`Settings-SaveFail.png`](screens/Settings-SaveFail.png) |
| Settings · dark | [`Settings-Dark.dc.html`](source/Settings-Dark.dc.html) | [`Settings-Dark.png`](screens/Settings-Dark.png) |

### System states

| Artboard | Source | Screenshots |
|---|---|---|
| Not found | [`NotFound.dc.html`](source/NotFound.dc.html) | [`NotFound.png`](screens/NotFound.png) |
| Not found · dark | [`NotFound-Dark.dc.html`](source/NotFound-Dark.dc.html) | [`NotFound-Dark.png`](screens/NotFound-Dark.png) |
| Permission denied · portal | [`Denied.dc.html`](source/Denied.dc.html) | [`Denied.png`](screens/Denied.png) |
| Permission denied · dark | [`Denied-Dark.dc.html`](source/Denied-Dark.dc.html) | [`Denied-Dark.png`](screens/Denied-Dark.png) |
| Permission denied · staff admin | [`Denied-Staff.dc.html`](source/Denied-Staff.dc.html) | [`Denied-Staff.png`](screens/Denied-Staff.png) |

## Staff admin

### Companies

| Artboard | Source | Screenshots |
|---|---|---|
| Companies | [`Companies.dc.html`](source/Companies.dc.html) | [`Companies.png`](screens/Companies.png) |
| Companies · loading | [`Companies-Loading.dc.html`](source/Companies-Loading.dc.html) | [`Companies-Loading.png`](screens/Companies-Loading.png) |
| Companies · dark | [`Companies-Dark.dc.html`](source/Companies-Dark.dc.html) | [`Companies-Dark.png`](screens/Companies-Dark.png) |
| Companies · 1024 | [`Companies-1024.dc.html`](source/Companies-1024.dc.html) | [`Companies-1024.png`](screens/Companies-1024.png) |

### Company detail

| Artboard | Source | Screenshots |
|---|---|---|
| Company detail | [`CompanyDetail.dc.html`](source/CompanyDetail.dc.html) | [`CompanyDetail.png`](screens/CompanyDetail.png) |
| Company detail · dark | [`CompanyDetail-Dark.dc.html`](source/CompanyDetail-Dark.dc.html) | [`CompanyDetail-Dark.png`](screens/CompanyDetail-Dark.png) |

### Read-only portal

| Artboard | Source | Screenshots |
|---|---|---|
| Portal · read only | [`RO-Overview.dc.html`](source/RO-Overview.dc.html) | [`RO-Overview.png`](screens/RO-Overview.png) |
| Portal · read only · dark | [`RO-Overview-Dark.dc.html`](source/RO-Overview-Dark.dc.html) | [`RO-Overview-Dark.png`](screens/RO-Overview-Dark.png) |
| Role detail · read only | [`RO-RoleDetail.dc.html`](source/RO-RoleDetail.dc.html) | [`RO-RoleDetail.png`](screens/RO-RoleDetail.png) |
| Questions · read only | [`RO-Questions.dc.html`](source/RO-Questions.dc.html) | [`RO-Questions.png`](screens/RO-Questions.png) |

### Users

| Artboard | Source | Screenshots |
|---|---|---|
| Users | [`Users.dc.html`](source/Users.dc.html) | [`Users.png`](screens/Users.png) |
| Ban user · confirm | [`Users-Ban.dc.html`](source/Users-Ban.dc.html) | [`Users-Ban.png`](screens/Users-Ban.png) |
| Users · after ban | [`Users-Banned.dc.html`](source/Users-Banned.dc.html) | [`Users-Banned.png`](screens/Users-Banned.png) |
| Users · dark | [`Users-Dark.dc.html`](source/Users-Dark.dc.html) | [`Users-Dark.png`](screens/Users-Dark.png) |

### Model usage

| Artboard | Source | Screenshots |
|---|---|---|
| Model usage | [`ModelUsage.dc.html`](source/ModelUsage.dc.html) | [`ModelUsage.png`](screens/ModelUsage.png) |
| Model usage · dark | [`ModelUsage-Dark.dc.html`](source/ModelUsage-Dark.dc.html) | [`ModelUsage-Dark.png`](screens/ModelUsage-Dark.png) |

### Generation jobs

| Artboard | Source | Screenshots |
|---|---|---|
| Generation jobs · 3 selected | [`Jobs.dc.html`](source/Jobs.dc.html) | [`Jobs.png`](screens/Jobs.png) |
| Generation jobs · retried | [`Jobs-Retried.dc.html`](source/Jobs-Retried.dc.html) | [`Jobs-Retried.png`](screens/Jobs-Retried.png) |
| Generation jobs · dark | [`Jobs-Dark.dc.html`](source/Jobs-Dark.dc.html) | [`Jobs-Dark.png`](screens/Jobs-Dark.png) |

### Content flags

| Artboard | Source | Screenshots |
|---|---|---|
| Content flags | [`Flags.dc.html`](source/Flags.dc.html) | [`Flags.png`](screens/Flags.png) |
| Content flags · dark | [`Flags-Dark.dc.html`](source/Flags-Dark.dc.html) | [`Flags-Dark.png`](screens/Flags-Dark.png) |

## Design system and handoff

### Design-system additions and handoff

| Artboard | Source | Screenshots |
|---|---|---|
| Design-system additions | [`DSAdditions.dc.html`](source/DSAdditions.dc.html) | [`DSAdditions-tile-01.png`](screens/DSAdditions-tile-01.png), [`DSAdditions-tile-02.png`](screens/DSAdditions-tile-02.png), [`DSAdditions-tile-03.png`](screens/DSAdditions-tile-03.png), [`DSAdditions-tile-04.png`](screens/DSAdditions-tile-04.png), [`DSAdditions.png`](screens/DSAdditions.png) |
| Design-system additions · dark | [`DSAdditions-Dark.dc.html`](source/DSAdditions-Dark.dc.html) | [`DSAdditions-Dark-tile-01.png`](screens/DSAdditions-Dark-tile-01.png), [`DSAdditions-Dark-tile-02.png`](screens/DSAdditions-Dark-tile-02.png), [`DSAdditions-Dark-tile-03.png`](screens/DSAdditions-Dark-tile-03.png), [`DSAdditions-Dark-tile-04.png`](screens/DSAdditions-Dark-tile-04.png), [`DSAdditions-Dark.png`](screens/DSAdditions-Dark.png) |
| Handoff notes | [`Handoff.dc.html`](source/Handoff.dc.html) | [`Handoff-tile-01.png`](screens/Handoff-tile-01.png), [`Handoff-tile-02.png`](screens/Handoff-tile-02.png), [`Handoff-tile-03.png`](screens/Handoff-tile-03.png), [`Handoff-tile-04.png`](screens/Handoff-tile-04.png), [`Handoff-tile-05.png`](screens/Handoff-tile-05.png), [`Handoff-tile-06.png`](screens/Handoff-tile-06.png), [`Handoff.png`](screens/Handoff.png) |

### Shared navigation

| Artboard | Source | Screenshots |
|---|---|---|
| PortalNav component | [`PortalNav.dc.html`](source/PortalNav.dc.html) | [`PortalNav.png`](screens/PortalNav.png) |
| StaffNav component | [`StaffNav.dc.html`](source/StaffNav.dc.html) | [`StaffNav.png`](screens/StaffNav.png) |
