# Marketing site design

The design for learnquiz.com (`apps/site`): the home page at 1280, 768 and 360 in light and dark, the `/privacy` and `/terms` pages, the share image, the favicon and the design-system additions. It follows the design system in [`../design-system.md`](../design-system.md). Source bundle version `1793715526-2afc`, captured 2026-11-03.

- `source/`: the design source. `Main.dc.html` is the whole home page; the other home files import it with a `theme` prop. `site.css` holds all layout; `canvas.json` holds board order and titles; `tokens.json` the design tokens; `favicon.svg` the icon.
- `screens/`: each artboard rendered at 1x (width as named). The 768 and 360 pages are split in two files, `-a` (top) and `-b` (from "For managers"); `-scrolled-x` is the top part scrolled sideways to the right.
- [`HANDOFF.md`](HANDOFF.md): per-section layout, components, motion and screen reader notes, placeholders and production notes.
- [`DS-ADDITIONS.md`](DS-ADDITIONS.md): what the site adds to the design system.

The interactive answer demo's behavior is defined in [`source/Main.dc.html`](source/Main.dc.html) and [`HANDOFF.md`](HANDOFF.md) section 5.

| Artboard | Source | Screenshots |
|---|---|---|
| Home · 1280 · light (interactive) | [`Main.dc.html`](source/Main.dc.html) | [`Home-1280-light.png`](screens/Home-1280-light.png) |
| Home · 1280 · dark | [`Home-1280-dark.dc.html`](source/Home-1280-dark.dc.html) | [`Home-1280-dark.png`](screens/Home-1280-dark.png) |
| Home · 768 · light · 1 of 2 | [`Home-768-light-a.dc.html`](source/Home-768-light-a.dc.html) | [`Home-768-light-a.png`](screens/Home-768-light-a.png), [`Home-768-light-a-scrolled-x.png`](screens/Home-768-light-a-scrolled-x.png) |
| Home · 768 · light · 2 of 2 | [`Home-768-light-b.dc.html`](source/Home-768-light-b.dc.html) | [`Home-768-light-b.png`](screens/Home-768-light-b.png) |
| Home · 768 · dark · 1 of 2 | [`Home-768-dark-a.dc.html`](source/Home-768-dark-a.dc.html) | [`Home-768-dark-a.png`](screens/Home-768-dark-a.png), [`Home-768-dark-a-scrolled-x.png`](screens/Home-768-dark-a-scrolled-x.png) |
| Home · 768 · dark · 2 of 2 | [`Home-768-dark-b.dc.html`](source/Home-768-dark-b.dc.html) | [`Home-768-dark-b.png`](screens/Home-768-dark-b.png) |
| Home · 360 · light · 1 of 2 | [`Home-360-light-a.dc.html`](source/Home-360-light-a.dc.html) | [`Home-360-light-a.png`](screens/Home-360-light-a.png), [`Home-360-light-a-scrolled-x.png`](screens/Home-360-light-a-scrolled-x.png) |
| Home · 360 · light · 2 of 2 | [`Home-360-light-b.dc.html`](source/Home-360-light-b.dc.html) | [`Home-360-light-b.png`](screens/Home-360-light-b.png) |
| Home · 360 · dark · 1 of 2 | [`Home-360-dark-a.dc.html`](source/Home-360-dark-a.dc.html) | [`Home-360-dark-a.png`](screens/Home-360-dark-a.png), [`Home-360-dark-a-scrolled-x.png`](screens/Home-360-dark-a-scrolled-x.png) |
| Home · 360 · dark · 2 of 2 | [`Home-360-dark-b.dc.html`](source/Home-360-dark-b.dc.html) | [`Home-360-dark-b.png`](screens/Home-360-dark-b.png) |
| /privacy | [`Privacy.dc.html`](source/Privacy.dc.html) | [`Privacy.png`](screens/Privacy.png) |
| /terms | [`Terms.dc.html`](source/Terms.dc.html) | [`Terms.png`](screens/Terms.png) |
| Share image · 1200 × 630 | [`ShareImage.dc.html`](source/ShareImage.dc.html) | [`ShareImage.png`](screens/ShareImage.png) |
| Favicon and app icon | [`Favicon.dc.html`](source/Favicon.dc.html) | [`Favicon.png`](screens/Favicon.png) |
| Design-system additions | [`DSAdditions.dc.html`](source/DSAdditions.dc.html) | [`DSAdditions.png`](screens/DSAdditions.png) |
| Handoff notes | [`Handoff.dc.html`](source/Handoff.dc.html) | None |
