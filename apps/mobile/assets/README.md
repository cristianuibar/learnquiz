# Android icons

The source of truth is `docs/design/logo/`, which contains the unchanged official
design exports and their usage rules. These PNGs were rendered with `rsvg-convert`:

- `icon.png`: `learnquiz-app-icon.svg`, rendered at 1024 × 1024.
- `adaptive-icon.png`: the same SVG with only its background rectangle removed
  and its group transform changed from `translate(128 128) scale(12)` to
  `translate(192 192) scale(10)`, rendered at 1024 × 1024. The mark is uniformly
  scaled about the canvas center; its white ring, saffron dot and gap are intact.
  The ring extends 260 px from the center and the dot extends at most
  `sqrt(160² + 160²) + 90 ≈ 316.3 px`, both inside the central 66% safe circle
  (337.92 px radius). The petrol background comes from `app.config.ts`.
- `notification-icon.png`: `learnquiz-notification.svg`, rendered at 96 × 96
  (24 dp at xxxhdpi), white on transparent.

Use `rsvg-convert -w SIZE -h SIZE -o OUTPUT INPUT.svg` for each size above;
apply the adaptive foreground changes to a temporary copy, never the originals.

Launcher and notification icons are native resources. Shipping changes requires
a new Android build; an OTA update cannot replace them.
