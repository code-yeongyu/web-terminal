# web-terminal Design System

Single source of truth for every visual decision in this project. No component is written without reading this file first. Every color, space, size, duration, and radius below is a named token. Raw values are forbidden outside this document.

---

## 0. Research Log

One line per research lane. A lane with no line did not run.

- **Embedded refs (Layer A + Layer B)**: shortlisted `warp.md` (modern terminal, block-based command UI), `voltagent.md` (void-black, terminal-native, emerald), and `raycast.md` (dark macOS-native chrome). Picked **Layer A `taste-skill.md`** + **Layer B `raycast.md`**.
  - **Why `taste-skill.md` over `minimalist-skill.md`**: `minimalist-skill.md` is hard-locked to a warm monochrome *light* canvas (`#FFFFFF` / `#F7F6F3`), editorial serif display type, bento grids, and macro-whitespace. This product is a dark, full-viewport, single-surface tool with zero marketing copy and near-zero whitespace budget; adopting it would have required overriding its palette, its type architecture, and its layout thesis at once. `taste-skill.md` supplies exactly what this product needs and stays aesthetic-neutral where it must: the Dark Mode Protocol (Section 8: no pure `#000000`, no pure `#ffffff`, token strategy, hierarchy parity), the performance and a11y guardrails (Section 6: transform/opacity only, mandatory `prefers-reduced-motion`, z-index restraint, `100dvh` over `100vh`), the full interactive-state cycle requirement (Section 4.5: loading, empty, error, focus, tactile feedback), and the AI-tell bans that keep this from reading as generic hacker slop. Dials set below.
  - **Why `raycast.md` over `linear.app.md`**: three direct hits. (1) Its canvas is a near-black *blue-tinted* `#07080a` rather than pure black, which is precisely the "premium dark, not hacker-green" register requested, and it keeps the terminal's own ANSI colors as the only saturated thing on screen. (2) It documents a **keyboard key-cap component** (gradient cap, layered inset shadow, 4-6px radius) - this project's mobile touch key toolbar is the single highest-risk surface, and Raycast gives it a proven anatomy instead of an invention. (3) Its depth system is macOS-native ring + inset rather than blurry drop shadows, which is cheap to render and reads correctly on a surface that sits behind a WASM canvas. `linear.app.md` is excellent but its purple accent and marketing-page grammar carry less into a docked-panel tool shell.
  - **Adopted from Raycast**: blue-tinted near-black canvas, `rgba(255,255,255,0.06)` hairline containment borders, ring + inset depth over drop shadows, key-cap anatomy, opacity-based hover transitions, weight 500 as the UI body baseline.
  - **Deliberately rejected from Raycast**: positive letter-spacing (+0.2px) is a marketing-page readability trick and actively harms dense terminal-adjacent UI at 12-13px, so tracking is neutral-to-negative here; the 86px pill CTA (wrong register for a tool); Inter as the shipped webfont (violates this project's low-bandwidth ethos - system stack instead); Raycast Red as brand punctuation (reassigned to error-only, because a terminal already owns red semantically via ANSI).
- **StyleGallery (`github.com/changeroa/StyleGallery`, user-mandated)**: fetched and read via `raw.githubusercontent.com` - `layout/index.md`, `motion/index.md`, `motion/vocabulary.md`, `patterns/viewport-shell/index.md`, `patterns/viewport-shell/scroll-body-shell.md`, `patterns/viewport-shell/panel-layout.md`, `patterns/split-sidebar/main-with-rail.md`, `patterns/overlay-exception/overlay-stack.md`, `patterns/overlay-exception/imposter.md`, `patterns/in-line-grouping/reel.md`, `patterns/in-line-grouping/tab-strip.md`, `patterns/containment/index.md`, `recipes/command-surface.md`, `quality/gates/layout.md`, and the `governed-local/terminal` button state + keyboard matrices. Patterns adopted and the constraints they impose are binding rules in **Section 4.4 (StyleGallery Layout Contract)** and **Section 6.3 (StyleGallery Motion Boundary)**. Headline constraints taken: named scroll ownership per region (Layout Principle 7), one primary spatial problem per primitive (Principle 3), no decorative or animated properties in reusable layout CSS (Principle 8 + the Motion domain's explicit scope boundary), `min-block-size: 0` / `min-inline-size: 0` on every grid child that owns scroll or must shrink, and the `command-surface` recipe's rule that fixed command regions live *outside* the body scroll container.
- **Herdr live runtime (`herdr.dev`, user-mandated visual reference)**: captured in real Chromium at 1440px and inspected with `getComputedStyle`. Adopted: zero-radius structural cells, one-pixel neutral borders, shadowless chrome, compact mono metadata, explicit state dots, near-black layering, and accent-only hover/focus borders. Deliberately retained from this product instead of copying Herdr: the existing blue accent, the Section 2 accessible ANSI palette, 44px mobile targets, sans-serif navigation labels, fixed 320px desktop rail, and modest rounding only where a control must remain distinct from a structural cell.
- **Lazyweb lane**: **skipped**. Reason: task-mandated network-cost skip. `lazyweb.md` is a curl-heavy real-product screen-research lane; the visual direction was already pinned by an explicit brand reference (Raycast-grade dark craft) plus a hard low-bandwidth ethos, so the marginal direction gained does not justify the fetch budget.
- **Imagen drafts lane**: **skipped**. Reason: task-mandated network-cost skip, and the deliverable is a written contract with no component code. There is no reference-fidelity image to diff against; the ANSI palette and the ghostty theme object are the fidelity contract instead.
- **ui-ux-db sanity check**: **skipped**. Reason: no network/CLI budget in this task scope. Palette and type pairing are instead sanity-checked mechanically against the WCAG floors recorded in Section 8.1, computed from the token values in Section 2.

**Dials** (per `taste-skill.md` Section 1, reasoned not defaulted): `DESIGN_VARIANCE: 3` - this is a tool shell where the terminal owns the viewport; asymmetry would be noise, and the one structural asymmetry (right-docked panel) is functional. `MOTION_INTENSITY: 3` - motion exists only to explain state changes (drawer travel, toast arrival, latency shift); a terminal that animates is a terminal that feels slow. `VISUAL_DENSITY: 7` - cockpit register: hairlines instead of card boxes, mono for all numbers, tight paddings.

---

## 1. Atmosphere & Identity

web-terminal feels like the inside of a precision instrument that someone left running. The chrome is deliberately almost invisible: a blue-tinted near-black shell that recedes so completely that the only saturated color on screen is the terminal's own output. You are not looking at an app that contains a terminal; you are looking at a terminal that happens to have a hairline of chrome around it. Everything else - the top bar, the sidebar, the key toolbar - is rendered as a thin structural membrane that reports state and then gets out of the way.

**The signature is the hairline membrane.** Surfaces separate through 1px `rgba(255,255,255,0.06)` strokes and a single tonal step of background, never through shadows, never through cards, never through color. The result is a shell that reads as machined rather than designed: layers you notice only when you look for the seam. The one place this membrane thickens into something physical is the mobile key toolbar, where keys get a genuine cap treatment - a gradient face and an inset top highlight - because those are the only elements on the entire surface that a finger actually strikes. Chrome recedes; the things you press come forward. That is the whole visual thesis.

---

## 2. Color

This product is **dark-only**. There is no light theme. Per `taste-skill.md` Section 4.11 (Page Theme Lock), the theme is locked at the root and no surface inverts. The Light column below is intentionally `n/a`: shipping a half-considered light theme for a terminal whose ANSI palette is tuned for a dark background would break contrast parity on all 16 ANSI colors at once. Recorded as accepted debt in Section 8.2.

### 2.1 Palette

| Role | Token | Light | Dark | Usage |
|---|---|---|---|---|
| Surface / canvas | `--surface-canvas` | n/a | `#07080A` | App root, terminal backdrop, login page |
| Surface / primary | `--surface-primary` | n/a | `#0D0F11` | Top bar, sidebar body, key toolbar base |
| Surface / secondary | `--surface-secondary` | n/a | `#131518` | List rows at rest, tab strip trough, input fields |
| Surface / elevated | `--surface-elevated` | n/a` | `#17191C` | Dialogs, drawer panel, toasts, popovers |
| Surface / raised | `--surface-raised` | n/a | `#1B1E21` | Key caps, badges, chips, hovered list rows |
| Surface / sunken | `--surface-sunken` | n/a | `#050607` | Terminal viewport, editor textarea well |
| Surface / scrim | `--surface-scrim` | n/a | `rgba(5, 6, 7, 0.64)` | Drawer + dialog backdrop |
| Text / primary | `--text-primary` | n/a | `#F2F3F5` | Headings, list labels, input text |
| Text / secondary | `--text-secondary` | n/a | `#A8ADB4` | Tab labels, metadata, helper text |
| Text / tertiary | `--text-tertiary` | n/a | `#80858D` | Placeholders, timestamps, disabled labels |
| Text / inverse | `--text-inverse` | n/a | `#0D0F11` | Text on `--accent-primary` fills |
| Border / default | `--border-default` | n/a | `rgba(255, 255, 255, 0.10)` | Inputs, key caps, dialog edges |
| Border / subtle | `--border-subtle` | n/a | `rgba(255, 255, 255, 0.06)` | Region seams, list dividers, top-bar underline |
| Border / strong | `--border-strong` | n/a | `rgba(255, 255, 255, 0.18)` | Hovered inputs, active tab underline |
| Accent / primary | `--accent-primary` | n/a | `#5AB2FF` | Focus ring, active tab, primary button, links |
| Accent / hover | `--accent-hover` | n/a | `#82C6FF` | Accent hover state |
| Accent / muted | `--accent-muted` | n/a | `rgba(90, 178, 255, 0.14)` | Selected row wash, focus halo |
| Status / success | `--status-success` | n/a | `#4ADE80` | Connected dot, save confirmation |
| Status / warning | `--status-warning` | n/a | `#FBBF24` | Reconnecting dot, dirty indicator, rate-limit notice |
| Status / error | `--status-error` | n/a | `#FF6B6B` | Offline dot, login error, destructive actions |
| Status / info | `--status-info` | n/a | `#5AB2FF` | Informational toasts |
| Status / success wash | `--status-success-wash` | n/a | `rgba(74, 222, 128, 0.12)` | Success toast fill |
| Status / warning wash | `--status-warning-wash` | n/a | `rgba(251, 191, 36, 0.12)` | Warning toast fill, dirty chip |
| Status / error wash | `--status-error-wash` | n/a | `rgba(255, 107, 107, 0.12)` | Error toast fill, login error field |
| Status / neutral | `--status-neutral` | n/a | `#80858D` | Idle/unknown session dot |

### 2.2 Terminal ANSI Palette

The 16 ANSI colors are their own token family. They are **not** interchangeable with the semantic tokens above, and semantic UI must never reference an ANSI token (or vice versa) - the user's shell owns these, and remapping them across surfaces would make `ls` output and a status dot lie about each other. Tuned for `--term-bg` at a 4.5:1 floor on the normal set and 7:1 on the bright set.

| Role | Token | Value | Role | Token | Value |
|---|---|---|---|---|---|
| ANSI 0 black | `--ansi-black` | `#15181B` | ANSI 8 bright black | `--ansi-bright-black` | `#787F87` |
| ANSI 1 red | `--ansi-red` | `#F4736F` | ANSI 9 bright red | `--ansi-bright-red` | `#FF9490` |
| ANSI 2 green | `--ansi-green` | `#5FD68A` | ANSI 10 bright green | `--ansi-bright-green` | `#88E9AA` |
| ANSI 3 yellow | `--ansi-yellow` | `#E7B455` | ANSI 11 bright yellow | `--ansi-bright-yellow` | `#F7CE7A` |
| ANSI 4 blue | `--ansi-blue` | `#6AABF0` | ANSI 12 bright blue | `--ansi-bright-blue` | `#93C6F7` |
| ANSI 5 magenta | `--ansi-magenta` | `#C79AF0` | ANSI 13 bright magenta | `--ansi-bright-magenta` | `#DCBBF8` |
| ANSI 6 cyan | `--ansi-cyan` | `#5FC9D6` | ANSI 14 bright cyan | `--ansi-bright-cyan` | `#8CDEE8` |
| ANSI 7 white | `--ansi-white` | `#C3C8CE` | ANSI 15 bright white | `--ansi-bright-white` | `#F2F3F5` |

Terminal-specific surface tokens:

| Role | Token | Value | Usage |
|---|---|---|---|
| Terminal background | `--term-bg` | `#050607` | ghostty-web canvas background (= `--surface-sunken`) |
| Terminal foreground | `--term-fg` | `#D6DAE0` | Default glyph color |
| Terminal cursor | `--term-cursor` | `#5AB2FF` | Block/bar cursor (= `--accent-primary`) |
| Terminal cursor accent | `--term-cursor-accent` | `#050607` | Glyph color under a block cursor |
| Terminal selection bg | `--term-selection-bg` | `rgba(90, 178, 255, 0.30)` | Selection fill |
| Terminal selection fg | `--term-selection-fg` | `#F2F3F5` | Selected glyph color |
| Terminal selection inactive | `--term-selection-inactive` | `rgba(255, 255, 255, 0.12)` | Selection when terminal is unfocused |
| Terminal scrollbar | `--term-scrollbar` | `rgba(255, 255, 255, 0.14)` | Scrollbar slider |

### 2.3 ghostty-web / xterm `theme` object

Exact object to pass as the terminal's `theme` option. Key names match the xterm.js `ITheme` interface, which ghostty-web's compatibility layer consumes. This is the fidelity contract: the app must derive these strings from the tokens above at build time, never hand-maintain a second copy.

```json
{
  "background": "#050607",
  "foreground": "#D6DAE0",
  "cursor": "#5AB2FF",
  "cursorAccent": "#050607",
  "selectionBackground": "rgba(90, 178, 255, 0.30)",
  "selectionForeground": "#F2F3F5",
  "selectionInactiveBackground": "rgba(255, 255, 255, 0.12)",
  "scrollbarSliderBackground": "rgba(255, 255, 255, 0.14)",
  "scrollbarSliderHoverBackground": "rgba(255, 255, 255, 0.22)",
  "scrollbarSliderActiveBackground": "rgba(255, 255, 255, 0.30)",
  "black": "#15181B",
  "red": "#F4736F",
  "green": "#5FD68A",
  "yellow": "#E7B455",
  "blue": "#6AABF0",
  "magenta": "#C79AF0",
  "cyan": "#5FC9D6",
  "white": "#C3C8CE",
  "brightBlack": "#787F87",
  "brightRed": "#FF9490",
  "brightGreen": "#88E9AA",
  "brightYellow": "#F7CE7A",
  "brightBlue": "#93C6F7",
  "brightMagenta": "#DCBBF8",
  "brightCyan": "#8CDEE8",
  "brightWhite": "#F2F3F5"
}
```

### 2.4 Rules

- Surface hierarchy is built from tonal steps plus hairline borders. No shadows for structure (see Section 7).
- `--accent-primary` is used **only** for interactive affordance: focus, active tab, primary action, cursor. Never decorative, never a background wash on a large region.
- One accent for the whole app (`taste-skill.md` Color Consistency Lock). There is no second accent hue.
- Status colors are used **only** where they encode real machine state - connection status, save state, errors. Per `taste-skill.md` Section 9.F, decorative status dots are banned; the session dot, the herdr agent dot, and the herdr tab connection dot survive that ban because they report actual server state, and they are the only dots in the app. The herdr tab dot is fed by a background store that polls `/api/herdr/snapshot` from app start (5s while the panel is visible, 30s while hidden, paused while the document is hidden, backing off 5s to 60s while herdr is unavailable), so herdr connection state is live without the user opening the panel.
- ANSI tokens are consumed exclusively by the terminal theme object and the session-picker's per-session color echo. They never style chrome.
- Never introduce a color absent from these tables. Extend the table first.

---

## 3. Typography

### 3.1 Font Stacks

Two families, zero webfonts. The low-bandwidth ethos is a hard constraint: shipping a webfont for a terminal that renders its own glyphs to a canvas is unjustifiable network cost, and it introduces a FOUT on exactly the surface that must feel instant.

| Token | Value |
|---|---|
| `--font-sans` | `ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", Roboto, sans-serif` |
| `--font-mono` | `ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, "Cascadia Mono", "D2Coding", "Roboto Mono", monospace` |

Notes:
- Korean faces are named explicitly in both stacks so that IME composition text and Hangul filenames render in the intended face rather than a fallback with a different metric box. See Section 8.1 for the IME rule.
- The terminal canvas uses `--font-mono` so the ghostty-web cell metrics match the file-editor textarea; a user editing a file sees the same glyph shapes as the shell that printed it.
- Webfont budget: **zero.** If a future requirement forces one, it is one file, `woff2`, `font-display: swap`, self-hosted, and it is recorded as debt in Section 8.2.

### 3.2 Scale

Tool-shell scale. There is no display tier: nothing in this app is a hero. The largest type in the product is the login heading.

| Level | Token | Size | Weight | Line Height | Tracking | Usage |
|---|---|---|---|---|---|---|
| Title | `--text-title` | 20px / 1.25rem | 600 | 1.3 | -0.01em | Login heading, dialog title |
| Heading | `--text-heading` | 16px / 1rem | 600 | 1.4 | -0.005em | Sidebar section headers, session-picker group labels |
| Body | `--text-body` | 14px / 0.875rem | 400 | 1.5 | 0 | List rows, file names, dialog body, input text |
| Body strong | `--text-body-strong` | 14px / 0.875rem | 500 | 1.5 | 0 | Active list row, button labels, session name |
| Caption | `--text-caption` | 13px / 0.8125rem | 500 | 1.4 | 0 | Tab labels, toast body, helper text |
| Micro | `--text-micro` | 12px / 0.75rem | 500 | 1.35 | 0.01em | Latency chip, timestamps, file sizes, key-cap labels |
| Mono body | `--text-mono-body` | 14px / 0.875rem | 400 | 1.5 | 0 | File-editor textarea, path strings |
| Mono micro | `--text-mono-micro` | 12px / 0.75rem | 500 | 1.4 | 0 | Latency value, byte counts, session IDs |
| Terminal | `--text-terminal` | 14px / 0.875rem | 400 | 1.2 | 0 | ghostty-web cell size, desktop default |
| Terminal mobile | `--text-terminal-mobile` | 13px / 0.8125rem | 400 | 1.2 | 0 | ghostty-web cell size below `--bp-md` |

Weight tokens: `--weight-regular: 400`, `--weight-medium: 500`, `--weight-semibold: 600`. Nothing heavier ships.

### 3.3 Rules

- Two families maximum. No third family, no serif, no display face.
- Smallest shipped size is 12px (`--text-micro`), reserved for metadata that is never the only carrier of meaning. Body floor is 14px.
- Per `taste-skill.md` VISUAL_DENSITY 7: **every number renders in `--font-mono`.** Latency values, byte counts, line/column indicators, session IDs, timestamps. A latency chip that reflows its width as the number changes from `9ms` to `14ms` is a bug; mono digits prevent it.
- Tracking is neutral or slightly negative. This deliberately departs from the Raycast reference's +0.2px: positive tracking on 12-13px dense UI next to a monospace canvas makes the chrome look loose against the terminal grid.
- `font-variant-numeric: tabular-nums` on every mono numeric readout.
- Truncation: file names and session names truncate with `text-overflow: ellipsis` and carry the full string in `title`. Never wrap a list row to a second line.

---

## 4. Spacing & Layout

### 4.1 Base Unit

All spacing derives from a base of **4px**.

| Token | Value | Usage |
|---|---|---|
| `--space-0` | 0 | Reset |
| `--space-1` | 4px | Icon-to-label, key-cap inner |
| `--space-2` | 8px | List row inner vertical, chip padding, key gap |
| `--space-3` | 12px | Input padding, tab padding, toolbar edge |
| `--space-4` | 16px | Sidebar padding, dialog inner, top-bar horizontal |
| `--space-5` | 20px | Dialog header/footer padding |
| `--space-6` | 24px | Login card inner, section gap in sidebar |
| `--space-8` | 32px | Empty-state vertical breathing |
| `--space-10` | 40px | Login card vertical rhythm |
| `--space-12` | 48px | Maximum separation (login page top offset) |

The scale stops at `--space-12`. A tool shell that needs 96px of separation has a layout problem, not a spacing problem.

### 4.2 Size Tokens

Every fixed dimension in the app is named here. Nothing is a literal.

| Token | Value | Usage |
|---|---|---|
| `--size-topbar` | 44px | Top bar height |
| `--size-sidebar` | 320px | Docked sidebar width at `>= --bp-md` |
| `--size-drawer-max` | 88vw | Drawer max width below `--bp-md` (caps at `--size-sidebar`) |
| `--size-keybar` | 48px | Mobile key toolbar height |
| `--size-tap` | 44px | Minimum touch target, both axes |
| `--size-tap-lg` | 48px | Comfortable touch target (key caps) |
| `--size-row` | 40px | List row height (desktop) |
| `--size-row-touch` | 44px | List row height below `--bp-md` |
| `--size-control` | 36px | Button / input height (desktop) |
| `--size-control-touch` | 44px | Button / input height below `--bp-md` |
| `--size-dot` | 8px | Status dot diameter |
| `--size-dialog-max` | 720px | Desktop dialog max width |
| `--size-login-max` | 360px | Login card max width |
| `--size-toast-max` | 400px | Toast max width |
| `--size-icon` | 16px | Standard icon box |
| `--size-focus-ring` | 2px | Focus ring width |
| `--size-focus-offset` | 2px | Focus ring offset |
| `--size-hairline` | 1px | Border width, all borders |

### 4.3 Radii, Z-Index, Safe Area

Radii - one system, applied consistently (`taste-skill.md` Shape Consistency Lock). No pill shapes on anything except the status dot.

| Token | Value | Usage |
|---|---|---|
| `--radius-none` | 0 | Shell seams, tabs, sidebars, rows, mobile full-screen dialogs |
| `--radius-xs` | 2px | Key caps, compact icon controls, status chips |
| `--radius-sm` | 4px | Buttons, inputs, toasts, login card |
| `--radius-overlay` | 4px | Desktop dialogs and drawer inline-start corners |
| `--radius-full` | 9999px | Status dot only |

Z-index - a single documented scale (`taste-skill.md` Section 6.F). No arbitrary values anywhere in the codebase.

| Token | Value | Layer |
|---|---|---|
| `--z-base` | 0 | Terminal canvas, app shell |
| `--z-sticky` | 10 | Top bar, sidebar tab strip |
| `--z-keybar` | 20 | Mobile key toolbar |
| `--z-scrim` | 30 | Drawer / dialog backdrop |
| `--z-drawer` | 40 | Slide-over drawer panel |
| `--z-dialog` | 50 | File editor, session picker dialog |
| `--z-toast` | 60 | Toast stack |
| `--z-focus` | 70 | Focus-visible ring escape (never a container) |

Safe area - the notch and home bar are handled with named tokens, never raw `env()` calls scattered through components.

| Token | Value |
|---|---|
| `--safe-top` | `env(safe-area-inset-top, 0px)` |
| `--safe-right` | `env(safe-area-inset-right, 0px)` |
| `--safe-bottom` | `env(safe-area-inset-bottom, 0px)` |
| `--safe-left` | `env(safe-area-inset-left, 0px)` |

Application rules: the top bar adds `--safe-top` to its block-start padding (never its height token). The key toolbar adds `--safe-bottom` to its block-end padding. The drawer adds `--safe-right` to its inline-end padding and `--safe-top` / `--safe-bottom` to its block padding. The terminal region never applies safe-area padding directly - it is inset by its siblings, so the cursor line can never slide under the home bar.

### 4.4 StyleGallery Layout Contract (binding)

These rules are adopted from StyleGallery and are auditable. A violation is a defect, not a preference.

**Scroll ownership** (Layout Principle 7 - "if a pattern scrolls, the scrolling element must be obvious"). Every scrollable region in this app is named, and no region scrolls that is not on this list:

| Region | Scroll owner | Axis | Notes |
|---|---|---|---|
| App shell | **none** | - | `overflow: hidden`, `block-size: 100dvh`. The document never scrolls. |
| Terminal viewport | ghostty-web internal scrollback | block | Owned by the VT engine, not by CSS. The wrapper is `overflow: hidden`. |
| Sidebar panel body | sidebar body element | block | Independent of the terminal. Tab strip and sidebar header sit **outside** this container. |
| File editor textarea | textarea | block | The dialog itself never scrolls; header and footer are fixed rows of the dialog grid. |
| Session picker list | list body | block | Dialog header/footer outside the scroll container. |
| Mobile key toolbar | toolbar track | **inline only** | The `reel` pattern. Block-axis overflow is `hidden`. |
| Toast stack | **none** | - | Capped at 3 visible; the 4th coalesces. A scrolling toast stack is a defect. |

Consequences that are non-negotiable: the terminal and the sidebar never share a scroll context; opening the drawer must not scroll the terminal; scroll chaining out of the sidebar into the shell is blocked with `overscroll-behavior: contain`; the document body gets `overscroll-behavior: none` so mobile rubber-band cannot detach the fixed chrome.

**Adopted patterns and what each one binds:**

- `viewport-shell/scroll-body-shell` - the app root and both dialogs. Contract: `display: grid`, `grid-template-rows: auto minmax(0, 1fr) auto`, `max-block-size: 100dvh`, and the body child carries `min-block-size: 0; overflow: auto`. The `minmax(0, 1fr)` and `min-block-size: 0` are load-bearing: without them the terminal row refuses to shrink and pushes the key toolbar off-screen. `100dvh`, never `100vh` (also `taste-skill.md` Section 3.E).
- `viewport-shell/panel-layout` - the desktop terminal + sidebar split. Contract: both children get `min-inline-size: 0` so a long file name cannot widen the panel and squeeze the terminal. Adapted from the reference's symmetric `auto-fit` to an explicit `grid-template-columns: minmax(0, 1fr) var(--size-sidebar)` because the sidebar width is a fixed product decision, not a fluid one; the reference's wrap point is replaced by the documented `--bp-md` breakpoint, which satisfies the pattern's "change sizing values only when the new wrap point is documented" clause.
- `overlay-exception/overlay-stack` - the drawer + scrim, and the dialog + scrim. Contract: `display: grid` with both children in `grid-area: 1 / 1`. This is why the scrim and panel cannot desynchronize.
- `overlay-exception/imposter` - the centered desktop dialog and the login card.
- `in-line-grouping/reel` - the mobile key toolbar. Contract: `grid-auto-flow: column`, `overflow-x: auto`, explicit `grid-auto-columns`. Per the `command-surface` recipe, `reel` is used **only** because horizontal scanning is genuinely part of this interaction model (a key row cannot wrap without destroying muscle memory); everywhere else, command rows wrap.
- `in-line-grouping/tab-strip` - the Files / herdr tabs.
- `recipes/command-surface` - the overall shell grammar. Binding clauses taken verbatim in spirit: *"Keep fixed command regions outside the body scroll container"* (the key toolbar and top bar are grid rows of the shell, never children of the terminal region), and *"Do not let command text resize the shell"* (the latency chip and session name are `min-inline-size: 0` + truncating; a 4-digit latency value must not move the top bar's layout).

**Containment and structure rules:**

- One primary spatial problem per primitive (Principle 3). A primitive that both scrolls and pins is split, or explicitly labeled a shell/composite.
- Semantic structure first (Principle 2): layout classes never replace landmarks. `<header>` for the top bar, `<main>` for the terminal region, `<aside>` for the sidebar, `<dialog>` for dialogs, `<ul>/<li>` for lists, real `<button>` for every key cap. DOM order equals reading order equals focus order.
- No decorative debt in layout CSS (Principle 8): reusable layout classes carry only layout declarations. Color, border, shadow, typography, and transition live in the component layer. This is the rule most likely to be violated by convenience, and it is the one to audit first.
- `min-inline-size: 0` / `min-block-size: 0` on every grid or flex child that must shrink or scroll. Missing these is the single most common cause of a blown-out terminal shell.
- Prefer logical properties (`block-size`, `inline-size`, `padding-inline`, `border-inline-end`) throughout, per the repo's CSS authoring policy.
- Tokenize intent, keep mechanics raw: `minmax(0, 1fr)`, `100dvh`, `auto`, `fit-content`, `clamp()`, and `env()` are mechanics and stay literal. Widths, gaps, and heights are tokens.

### 4.5 Shell Composition

```
<= 767px  (drawer mode)                >= 768px  (docked mode)
+---------------------------+          +---------------------------------------+
| top bar        --size-topbar|         | top bar              --size-topbar     |
+---------------------------+          +-----------------------+---------------+
|                           |          |                       | tab strip     |
|  terminal   minmax(0,1fr) |          | terminal              +---------------+
|                           |          | minmax(0,1fr)         | sidebar body  |
|                           |          |                       | (owns scroll) |
+---------------------------+          |                       |               |
| key toolbar  --size-keybar|          |                       | --size-sidebar|
+---------------------------+          +-----------------------+---------------+
    drawer overlays from inline-end
    over terminal + scrim
```

Shell rows: `grid-template-rows: auto minmax(0, 1fr) auto`. Desktop columns: `grid-template-columns: minmax(0, 1fr) var(--size-sidebar)`. The key toolbar row collapses to `0` at `>= --bp-md`; it is not rendered at all, not merely hidden.

**Cursor-line guarantee** (hard product constraint): the terminal region's block size is computed as viewport minus top bar minus key toolbar minus safe areas, and ghostty-web is resized to that box. Because the key toolbar is a *sibling grid row* and not an overlay, the last terminal line can never sit underneath it. When the on-screen keyboard opens, root visual-viewport variables size and inset both the shell and any body-level overlay; no ancestor between the terminal textarea and the viewport is transformed, so IME candidate and preedit coordinates remain stable. The toolbar rides the keyboard's top edge while the terminal region shrinks. The drawer deliberately covers the terminal and owns its own visible header/close control below the shell top bar.

### 4.6 Breakpoints

| Token | Value | Behavior |
|---|---|---|
| `--bp-sm` | 375px | Minimum supported width. Layout must not break below this; no horizontal scroll of primary content. |
| `--bp-md` | 768px | Sidebar switches from slide-over drawer to docked panel. Key toolbar disappears. Touch sizes drop to desktop sizes. |
| `--bp-lg` | 1024px | Dialogs reach `--size-dialog-max`. No structural change. |

`--bp-md` is the only structural breakpoint. There is exactly one layout mode change in this app, and it is documented here.

---

## 5. Components

Each primitive lists structure, variants, spacing, the full state set, accessibility, motion, and its layout primitive + scroll owner (StyleGallery requirement).

### 5.1 Button

- **Structure**: `<button type="..." class="btn btn--{variant}"><span class="btn__icon"/><span class="btn__label"/></button>`
- **Variants**: `primary` (accent fill, `--text-inverse` label), `secondary` (transparent, `--border-default` stroke), `ghost` (no fill, no stroke, `--text-secondary` label), `danger` (transparent, `--status-error` label and stroke).
- **Spacing**: block-size `--size-control` (`--size-control-touch` below `--bp-md`); `padding-inline: --space-3`; icon-to-label gap `--space-1`; radius `--radius-sm`; `--text-body-strong`.
- **States**:
  - default - as per variant.
  - hover - opacity `0.72` on `primary`/`danger` (Raycast opacity-transition pattern); `--surface-raised` fill on `secondary`/`ghost`.
  - active - `transform: scale(0.98)`, `--dur-micro`.
  - focus-visible - `--size-focus-ring` solid `--accent-primary` ring at `--size-focus-offset`. Never removed, never replaced by a color change alone.
  - disabled - `--text-tertiary` label, `opacity: 0.5`, `cursor: not-allowed`, `aria-disabled="true"`, activation suppressed.
  - loading - label stays in place (no width jump), a 12px inline indicator replaces the icon slot, `aria-busy="true"`, activation suppressed.
  - error - buttons do not carry error state; the surrounding form does.
- **Accessibility**: real `<button>`. `Enter` and `Space` activate. Icon-only buttons require `aria-label`. Label never wraps. Contrast verified in Section 8.1. Follows the StyleGallery terminal-profile button matrix: `action` mode maps `Enter`/`Space` to invoke, `busy`/`disabled` suppress activation and expose `aria-busy` / `aria-disabled`.
- **Motion**: `--dur-micro` / `--ease-out` on opacity and transform only.
- **Layout**: `cluster`. No scroll owner.

### 5.2 Input

- **Structure**: `<div class="field"><label for/><input id/><p class="field__msg" role="status"|role="alert"/></div>`
- **Variants**: `text`, `password` (login), `search` (sidebar file filter).
- **Spacing**: block-size `--size-control` / `--size-control-touch`; `padding-inline: --space-3`; label-to-input gap `--space-2`; input-to-message gap `--space-2`; radius `--radius-sm`; fill `--surface-secondary`; stroke `--border-default`.
- **States**: default; hover - stroke `--border-strong`; focus-visible - stroke `--accent-primary` plus `--accent-muted` halo, no glow bloom; filled; disabled - `opacity: 0.5`; error - stroke `--status-error`, fill `--status-error-wash`, message in `--status-error` with `role="alert"`; loading - input goes `readonly` with `aria-busy`, never disabled (disabling drops focus and breaks the mobile keyboard).
- **Accessibility**: label always above the input and always present in the DOM - **no placeholder-as-label, ever** (`taste-skill.md` Section 4.6). Placeholder is `--text-tertiary` and only ever supplementary. `font-size` is at least 16px on `type="password"` and `type="text"` below `--bp-md` to prevent iOS Safari's focus zoom - this is the one place a size overrides the type scale, and it is recorded as debt in Section 8.2.
- **Motion**: border-color and background-color cross-fade at `--dur-micro`. Layout never animates.
- **Layout**: `stack`. No scroll owner.

### 5.3 Tab

- **Structure**: `<div role="tablist"><button role="tab" aria-selected aria-controls/></div>` over `<div role="tabpanel" tabindex="0">`.
- **Variants**: `sidebar` (Files / herdr) only. Two tabs, no overflow, no scroll.
- **Spacing**: strip block-size `--size-tap`; per-tab `padding-inline: --space-4`; `--text-caption`; trough `--surface-secondary`; active indicator is a `--size-hairline` `--accent-primary` border-block-end.
- **States**: default `--text-secondary`; hover `--text-primary`; selected `--text-primary` + accent underline + `aria-selected="true"`; focus-visible standard ring, inset so it is not clipped by the strip; disabled n/a.
- **Accessibility**: roving tabindex. `ArrowLeft`/`ArrowRight` move between tabs, `Home`/`End` jump to ends. The panel is the tab's `aria-controls` target and is itself focusable so keyboard users reach the scrollable list.
- **Motion**: the underline **does not slide between tabs.** It cross-fades at `--dur-micro`. A sliding indicator is a shared-element transition on a reusable layout primitive, which Section 6.3 forbids.
- **Layout**: `tab-strip` (cluster). Strip is **outside** the panel's scroll container - it must not scroll away with the list.

### 5.4 List Row

Used by the file explorer, the herdr snapshot list, and the session picker.

- **Structure**: `<li><button class="row" | <a class="row">` with `<span class="row__lead"/>` (icon or status dot), `<span class="row__label"/>` (truncating), `<span class="row__meta"/>` (mono), `<span class="row__actions"/>`.
- **Variants**: `file`, `directory` (disclosure), `agent` (status dot lead), `session` (status dot lead + mono meta).
- **Spacing**: block-size `--size-row` / `--size-row-touch`; `padding-inline: --space-3`; internal gap `--space-2`; radius `--radius-none`; divider `--size-hairline` `--border-subtle`.
- **States**: default transparent; hover `--surface-raised`; active `scale(0.99)`; focus-visible standard ring, inset; selected `--accent-muted` fill + `--text-body-strong` + `aria-current`; disabled `opacity: 0.5`; loading - the row keeps its box and shows a 12px indicator in the meta slot (skeleton matches final shape, per `taste-skill.md` Section 4.5); empty - the *list* renders an empty state, never a row.
- **Per-row actions**: download / edit / delete. On desktop they are `opacity: 0` until row hover or focus-within, but they remain in the DOM and in the tab order at all times - visibility is never the mechanism for keyboard reachability. Below `--bp-md` they are always visible, each at `--size-tap`. Delete opens a confirm dialog; it never fires on first press.
- **Accessibility**: row label truncates with `title` carrying the full name. Nested interactive elements are siblings of the row button, never descendants of it. Directory disclosure exposes `aria-expanded`.
- **Motion**: background cross-fade at `--dur-micro`. Rows do **not** stagger in on mount - a file list that cascades is a file list that feels slow.
- **Layout**: `stack` inside the sidebar body. The row itself owns no scroll; the list body does.

### 5.5 Status Dot

- **Structure**: `<span class="dot dot--{state}" role="img" aria-label="{state}"/>` paired with a visible text label.
- **Variants**: `connected` (`--status-success`), `reconnecting` (`--status-warning`), `offline` (`--status-error`), `idle` (`--status-neutral`).
- **Spacing**: `--size-dot` square, `--radius-full`, gap `--space-2` to its label.
- **States**: static in all cases except `reconnecting`, which pulses opacity `1 -> 0.4 -> 1` over `--dur-pulse` on an infinite `--ease-in-out` loop. This is the **only** infinite animation in the product, and it is justified: it distinguishes "actively retrying" from "stopped trying" without text.
- **Accessibility**: **color is never the only signal.** Every dot is accompanied by a text label (`Connected`, `Reconnecting`, `Offline`) or, in the compact herdr row, by a shape difference plus `aria-label`. The connection status region is `aria-live="polite"`. Under `prefers-reduced-motion`, the pulse is replaced by a static `--status-warning` dot plus the text label already present.
- **Motion**: opacity only. Never scale (a scaling dot forces layout reflow of its row).
- **Layout**: inline within a `cluster`. No scroll owner.

### 5.6 Toast

- **Structure**: `<ol class="toasts" role="region" aria-label="Notifications"><li role="status"|role="alert"><span class="toast__icon"/><div class="toast__body"/><button class="toast__close"/></li></ol>`
- **Variants**: `info`, `success`, `warning`, `error`.
- **Spacing**: max inline-size `--size-toast-max`; padding `--space-3`; stack gap `--space-2`; radius `--radius-sm`; fill `--surface-elevated`; stroke `--border-default`; a `--size-hairline` inline-start accent in the matching status color; `--text-caption`.
- **Position**: block-end + inline-end on desktop, offset by `--space-4`. Below `--bp-md`: block-**start**, inset by `--space-3` plus `--safe-top`, because the block-end is owned by the key toolbar and the keyboard. Toasts never cover the key toolbar and never cover the cursor line.
- **States**: entering; resting; hover/focus-within - auto-dismiss timer pauses; exiting; error variant persists until dismissed (`role="alert"`), all others auto-dismiss after `--dur-toast`.
- **Stacking**: maximum 3 visible. A 4th collapses the oldest into a `+N more` line. The stack never scrolls.
- **Accessibility**: non-error toasts are `role="status"` (polite); error toasts are `role="alert"` (assertive). Close button is `--size-tap` and reachable by keyboard. Toasts never steal focus.
- **Motion**: enter - `opacity 0 -> 1` plus `translateY(--space-2 -> 0)` at `--dur-standard` / `--ease-out`. Exit - opacity only at `--dur-micro`. Reduced motion: opacity only, both directions.
- **Layout**: `stack`, positioned as an `imposter` relative to the shell. No scroll owner.

### 5.7 Drawer (mobile sidebar)

- **Structure**: `<div class="overlay"><div class="overlay__scrim" data-dismiss/><aside class="drawer" role="dialog" aria-modal="true" aria-label="Workspace panel"/></div>` - an `overlay-stack`, both children in the same grid cell.
- **Variants**: right-side only.
- **Spacing**: inline-size `min(var(--size-drawer-max), var(--size-sidebar))`; visual-viewport block-size; padding `--space-4` plus the safe-area tokens from Section 4.3; radius `--radius-overlay` on the inline-start corners only; fill `--surface-elevated`; inline-start stroke `--border-subtle`.
- **States**: closed (not rendered, or `display: none` - never merely `opacity: 0`, which would leave an invisible interactive layer over the terminal); opening; open; closing; dragging (follows the finger 1:1, `transform` only).
- **Dismissal**: scrim tap, `Escape`, swipe toward inline-end past 40% of the panel width or above a flick velocity threshold, and the toolbar close button. Four routes, because this panel covers the terminal.
- **Accessibility**: focus moves to the panel on open and returns to the trigger on close. Focus is trapped while open. Background content gets `inert`. `aria-modal="true"`. Body scroll lock is unnecessary (the document never scrolls) but the terminal region gets `inert` so keystrokes cannot leak into the shell while the drawer is open.
- **Motion**: `transform: translateX(100%) -> 0` at `--dur-standard` / `--ease-emphasis`; scrim `opacity 0 -> 1` at `--dur-standard` / `--ease-out`. Nothing else animates. Reduced motion: both appear instantly at `--dur-instant` with no travel.
- **Layout**: `overlay-stack`. Its **body** owns block scroll with `overscroll-behavior: contain`; the drawer header and tab strip sit outside that container.

### 5.8 Dialog (file editor, session picker, confirm)

- **Structure**: `<div class="overlay"><div class="overlay__scrim"/><div class="dialog" role="dialog" aria-modal="true" aria-labelledby><header/><div class="dialog__body"/><footer/></div></div>`
- **Variants**: `editor` (monospace body), `picker` (list body), `confirm` (short text body, `--size-login-max` wide).
- **Responsive**: below `--bp-md` the dialog follows the visual viewport with `--radius-none` on the outer corners, its own safe-area padding, and a 16px editor text floor. At `>= --bp-md` it is an `imposter` - centered, `inline-size: min(90vw, var(--size-dialog-max))`, `max-block-size: min(80dvh, 640px)`, radius `--radius-overlay`.
- **Spacing**: header/footer padding `--space-5`; body padding `--space-4`; footer button cluster gap `--space-2`, aligned to inline-end.
- **States**: closed, opening, open, closing, submitting (footer primary shows loading, body goes `readonly`), error (inline message above the footer, never a nested toast), dirty (see below).
- **Dirty indicator**: an `--status-warning` chip in the header reading `Unsaved` next to the file name, plus a `•` prefix on the title. Attempting to close while dirty routes through a confirm dialog. Ctrl/Cmd+S saves; `Escape` requests close (and hits the dirty guard).
- **Editor body**: a real `<textarea>` in `--font-mono` / `--text-mono-body`, `--surface-sunken` fill, `spellcheck="false"`, `autocapitalize="off"`, `autocorrect="off"`, `wrap="off"` with inline scroll. The textarea owns block scroll; the dialog does not.
- **Accessibility**: focus trap, focus restore, `inert` on the background, `Escape` to dismiss, `aria-labelledby` bound to the header title. The scroll container is the body, and it is keyboard-reachable.
- **Motion**: `opacity 0 -> 1` plus `scale(0.98 -> 1)` at `--dur-standard` / `--ease-emphasis` on desktop; on mobile it is a block-axis `translateY(--space-4 -> 0)` plus opacity. Reduced motion: opacity only.
- **Layout**: `overlay-stack` + `imposter`; internally a `scroll-body-shell` (`auto minmax(0,1fr) auto`).

### 5.9 Key Button (mobile touch toolbar)

The one place chrome becomes physical. Anatomy adapted from the Raycast key-cap reference, flattened to two shadow layers so it stays cheap to composite above a live canvas.

- **Structure**: `<div class="keybar" role="toolbar" aria-label="Terminal keys" aria-orientation="horizontal"><button class="key" data-key/></div>`
- **Variants**: `default` (Esc, Tab, `|`, `~`, `/`, `-`, arrows), `modifier` (Ctrl, Alt - latching), `combo` (Ctrl+C - a single labeled shortcut), `action` (Paste - clipboard API when allowed, with a native-paste fallback and system-paste guidance when Safari blocks programmatic reads).
- **Spacing**: min block-size `--size-tap-lg`, min inline-size `--size-tap`; `padding-inline: --space-2`; gap `--space-2`; track `padding-inline: --space-3`; radius `--radius-xs`; `--text-micro` in `--font-mono`.
- **Surface**: `--surface-raised` fill with a `--shadow-key` inset top highlight and `--border-default` stroke over the `--surface-primary` toolbar base, which carries a `--border-subtle` block-start seam.
- **States**:
  - default.
  - pressed - `transform: scale(0.96)` plus the inset highlight inverting, at `--dur-instant`. Fires on `pointerdown`, not `click`, so it feels mechanical.
  - **latched** (modifiers only) - `--accent-muted` fill, `--accent-primary` label, `--border-strong` stroke, `aria-pressed="true"`. Set by a single tap; consumed by the next key press or by tapping the modifier again; cleared on drawer/dialog open. Double-tap locks the modifier until an explicit third tap, and lock renders with a solid `--accent-primary` inline-end edge to distinguish it from a single latch.
  - focus-visible - standard ring, inset (the ring must not be clipped by the reel's overflow).
  - disabled - Paste renders disabled with `aria-disabled` when the Clipboard API is unavailable.
- **Behavior**: keys send their sequence to the terminal and **immediately return focus to the terminal input**. A key press must never blur the hidden input, or the on-screen keyboard collapses and the layout jumps. Buttons use `pointerdown` + `preventDefault` to avoid stealing focus in the first place. Arrow keys and Ctrl+C support press-and-hold auto-repeat after `--dur-repeat-delay` at `--dur-repeat-interval`.
- **Accessibility**: `role="toolbar"` with roving tabindex; `ArrowLeft`/`ArrowRight` traverse keys, `Home`/`End` jump to ends. Latched modifiers expose `aria-pressed`. Every key has a text label - no icon-only keys except the four arrows, which carry `aria-label`. Targets meet the 44px floor on both axes.
- **Motion**: transform and opacity only. The toolbar itself does not animate on scroll; the reel scrolls natively with momentum.
- **Layout**: `reel` - `grid-auto-flow: column`, `overflow-x: auto`, `overflow-y: hidden`, `scroll-snap-type: inline proximity`. It owns **inline scroll only**, and it is a grid row of the shell, never a child of the terminal region.

### 5.10 Latency Chip

- **Structure**: `<span class="chip"><span class="chip__value"/>ms</span>` inside the top bar's status cluster.
- **Variants**: tonal by threshold - `good` (< 80ms, `--text-secondary`), `fair` (80-200ms, `--status-warning`), `poor` (> 200ms, `--status-error`), `unknown` (offline, renders `--` in `--text-tertiary`).
- **Spacing**: `padding: --space-1 --space-2`; radius `--radius-xs`; fill `--surface-secondary`; `--text-mono-micro` with `tabular-nums`.
- **States**: measuring (shows the last value at `opacity: 0.6` rather than a spinner), settled, unknown.
- **Accessibility**: `aria-label="Round-trip latency 42 milliseconds"`. It lives in the polite live region with the connection status but updates are throttled to once per `--dur-latency-poll` so a screen reader is not flooded.
- **Motion**: the value cross-fades at `--dur-micro`; it never slides or counts up. Fixed inline-size via `ch` units so the top bar cannot reflow.
- **Layout**: inline in a `cluster`. No scroll owner.

### 5.11 Login Card

- **Structure**: `<main class="login"><form class="login__card"><h1/><Input type=password/><Button variant=primary/></form></main>`
- **Spacing**: `imposter`-centered on `--surface-canvas`; `inline-size: min(100% - var(--space-8), var(--size-login-max))`; padding `--space-6`; heading-to-field gap `--space-6`; field-to-button gap `--space-4`; radius `--radius-sm`; fill `--surface-primary`; stroke `--border-subtle`.
- **States**: idle; submitting (button loading, input `readonly`, `aria-busy`); error (`Incorrect password.` under the field in `--status-error` with `role="alert"`, field takes the error treatment, the input keeps focus and its value is selected); rate-limited (button disabled, message `Too many attempts. Try again in 0:24.` with a mono countdown, `role="status"`, updated once per second and announced only at start and end).
- **Accessibility**: single `<input type="password" autocomplete="current-password">` with a real visible label. The error message is bound via `aria-describedby` and `aria-invalid`. No password-strength theater, no caps-lock hint, no reveal toggle in v1. Submits on `Enter`. Autofocused on desktop; **not** autofocused below `--bp-md`, because forcing the on-screen keyboard open before the user has oriented is hostile.
- **Motion**: the card fades in once at `--dur-standard`. On error the field border cross-fades - **no shake**. A shake animation on a failed auth attempt is decoration, and reduced-motion users lose the signal entirely.
- **Layout**: `imposter` inside `center`. No scroll owner (the card never exceeds the viewport at `--bp-sm`).

### 5.12 Empty States

Every list gets one; they are components, not afterthoughts (`taste-skill.md` Section 4.5).

- **Structure**: `<div class="empty"><p class="empty__title"/><p class="empty__hint"/><Button variant=secondary/></div>`
- **Spacing**: centered in the list body, `padding-block: --space-8`, gap `--space-2`, max inline-size `40ch`.
- **Type**: title `--text-body-strong` in `--text-secondary`; hint `--text-caption` in `--text-tertiary`.
- **Copy** (plain and functional, no cute AI phrasing): Files - `No files here.` / `Upload a file to get started.`; herdr - `No active workspaces.` / `Agents will appear here when they start.`; sessions - `No live sessions.` / `Start a new session to begin.`
- **Motion**: none. Empty states appear instantly.

---

## 6. Motion & Interaction

### 6.1 Tokens

| Type | Token | Duration | Easing token | Easing value | Usage |
|---|---|---|---|---|---|
| Instant | `--dur-instant` | 80ms | `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` | Key press, tactile feedback |
| Micro | `--dur-micro` | 120ms | `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` | Hover, focus, background cross-fade |
| Standard | `--dur-standard` | 220ms | `--ease-emphasis` | `cubic-bezier(0.16, 1, 0.3, 1)` | Drawer, dialog, toast entry |
| Exit | `--dur-exit` | 160ms | `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Drawer, dialog, toast exit |
| Pulse | `--dur-pulse` | 1600ms | `--ease-in-out` | `cubic-bezier(0.4, 0, 0.6, 1)` | Reconnecting dot only |

Non-motion timing constants, tokenized here so they are not scattered as literals: `--dur-toast: 5000ms` (auto-dismiss), `--dur-latency-poll: 2000ms` (throttle), `--dur-repeat-delay: 400ms` and `--dur-repeat-interval: 60ms` (key auto-repeat).

Exits are faster than entries. Entry explains where something came from; exit just needs to get out of the way.

### 6.2 Rules

- **Only `transform` and `opacity` animate.** Never `width`, `height`, `top`, `left`, `margin`, `padding`, or `box-shadow`. This is a hard ban, not a preference: every one of them forces layout or paint on a surface sharing the compositor with a live WASM canvas.
- Nothing animates on the terminal region. Ever. Not on resize, not on reconnect, not on session switch. The terminal appears, disappears, or redraws.
- Every interactive element has hover, active, and focus-visible states.
- `will-change: transform` is set only on the drawer panel and only while it is open or dragging, then removed.
- No infinite animation except the reconnecting dot (Section 5.5). No shimmer, no skeleton pulse, no marquee, no spinner on the terminal.
- No scroll-triggered animation anywhere. There is no scrolling page to trigger from, and `window.addEventListener('scroll')` is banned outright (`taste-skill.md` Section 5.D).
- No staggered list reveals. A file list that cascades in reads as latency.
- Motion must be motivated. Every animation in this product answers one of: *where did this panel come from* (drawer, dialog), *did my press register* (key cap, button), *is something still happening* (reconnecting dot), *something arrived* (toast). Nothing else moves.

### 6.3 StyleGallery Motion Boundary (binding)

Adopted from StyleGallery's Motion domain scope boundary and Layout Principle 8. These are auditable rules:

- **No motion in reusable layout primitives.** The Motion domain explicitly does not grant "permission to add animation or decorative properties to reusable Layout pattern CSS." Concretely: `scroll-body-shell`, `panel-layout`, `overlay-stack`, `imposter`, `reel`, `tab-strip`, `stack`, and `cluster` classes contain **zero** `transition`, `animation`, `transform`, `will-change`, color, border, shadow, or typography declarations. Motion lives on component classes that compose those primitives. A `transition` found on a layout class is a violation.
- **No shared-element transitions.** The tab indicator cross-fades rather than sliding (Section 5.3); the drawer does not morph out of its trigger button. Per the Motion Vocabulary, identity continuity is a perception claim requiring rendered evidence, and this product has no budget to prove it.
- **No layout animation.** Position and size changes apply instantly. Only overlays translate, and they translate as a whole composited layer.
- **No scroll-driven motion.** Terminal scrollback is owned by the VT engine; the reel scrolls natively. Neither drives an animation.
- **Named motion only.** Every animation in the product is one of: fade, slide (overlays only), scale transition (press feedback only), or pulse (reconnecting dot only). Anything an implementer cannot name from that list does not ship.
- **No unmeasured performance claims.** Where this document says a technique is cheap, it means it is composited (transform/opacity); it does not assert a frame rate.

### 6.4 Reduced Motion

Under `@media (prefers-reduced-motion: reduce)`:

- All durations collapse to `--dur-instant` (never to `0` - an abrupt swap can be more disorienting than a fast one, and `0` breaks `transitionend` listeners).
- The drawer and dialogs lose their travel and appear with opacity only.
- The reconnecting dot stops pulsing and renders statically; its adjacent text label already carries the meaning.
- Key press feedback drops the scale and keeps the fill change, so tactile confirmation survives.
- Toast entry drops its translate and keeps its fade.

Reduced motion never removes a state signal. Every animated affordance has a non-animated carrier: text, color, or `aria-*`.

---

## 7. Depth & Surface

### Strategy

**Tonal-shift plus hairline** - and nothing else. Chosen and committed.

Surfaces separate through a single tonal step (`--surface-canvas` -> `--surface-primary` -> `--surface-secondary` -> `--surface-elevated` -> `--surface-raised`) reinforced by a `--size-hairline` `--border-subtle` seam. No drop shadows for structure anywhere in the product.

| Type | Token | Value | Usage |
|---|---|---|---|
| Seam | `--border-subtle` | `1px solid rgba(255, 255, 255, 0.06)` | Region boundaries: top bar underline, sidebar inline-start edge, key toolbar block-start edge, list dividers |
| Edge | `--border-default` | `1px solid rgba(255, 255, 255, 0.10)` | Component outlines: inputs, key caps, dialogs, toasts |
| Emphasis | `--border-strong` | `1px solid rgba(255, 255, 255, 0.18)` | Hovered inputs, latched key caps |

Two exceptions, both narrow and both named:

| Token | Value | Usage |
|---|---|---|
| `--shadow-key` | `inset 0 1px 0 rgba(255, 255, 255, 0.07)` | Key-cap top highlight. Inset only; costs no blur. |
| `--shadow-overlay` | `0 16px 48px rgba(0, 0, 0, 0.56)` | Drawer panel and desktop dialog only. Separates a modal layer from a live terminal, which a hairline alone cannot do. |

Rules:
- No `backdrop-filter` anywhere. Blurring a live terminal canvas is expensive on exactly the mobile devices this app targets, and the scrim already does the job. Recorded as a deliberate rejection, not debt.
- No gradients except the key-cap inset highlight above.
- No glows, no neon, no colored shadows (`taste-skill.md` Section 9.A).
- Cards are omitted in favor of spacing and hairlines wherever possible (`taste-skill.md` Section 4.4). The login card and the dialogs are the only boxed containers in the product.

---

## 8. Accessibility Constraints & Accepted Debt

### 8.1 Constraints

**WCAG target: 2.2 AA.** Contrast floor 4.5:1 for body text, 3:1 for large text and non-text UI (borders, icons, focus indicators, status dots).

Verified pairs, computed programmatically from the token values in Section 2 (sRGB relative luminance per WCAG 2.x). Ratios are exact, not estimated; `--text-tertiary` and `--ansi-bright-black` were both raised from their first-draft values because the computation put them under the floor:

| Foreground | Background | Ratio | Verdict |
|---|---|---|---|
| `--text-primary` `#F2F3F5` | `--surface-canvas` `#07080A` | 18.05:1 | pass |
| `--text-primary` `#F2F3F5` | `--surface-elevated` `#17191C` | 15.86:1 | pass |
| `--text-secondary` `#A8ADB4` | `--surface-primary` `#0D0F11` | 8.51:1 | pass |
| `--text-tertiary` `#80858D` | `--surface-primary` `#0D0F11` | 5.17:1 | pass |
| `--text-tertiary` `#80858D` | `--surface-secondary` `#131518` | 4.93:1 | pass |
| `--text-tertiary` `#80858D` | `--surface-raised` `#1B1E21` | 4.51:1 | pass (tightest pair in the system) |
| `--accent-primary` `#5AB2FF` | `--surface-canvas` `#07080A` | 8.82:1 | pass |
| `--text-inverse` `#0D0F11` | `--accent-primary` `#5AB2FF` | 8.46:1 | pass (primary button) |
| `--status-error` `#FF6B6B` | `--surface-primary` `#0D0F11` | 6.92:1 | pass |
| `--status-warning` `#FBBF24` | `--surface-primary` `#0D0F11` | 11.50:1 | pass |
| `--status-success` `#4ADE80` | `--surface-primary` `#0D0F11` | 11.02:1 | pass |
| `--term-fg` `#D6DAE0` | `--term-bg` `#050607` | 14.45:1 | pass |
| Dimmest ANSI (`--ansi-bright-black` `#787F87`) | `--term-bg` `#050607` | 5.01:1 | pass |

`--ansi-black` `#15181B` against `--term-bg` is intentionally near-invisible - that is the correct behavior for ANSI 0, and it is the user's shell's decision to use it. It is excluded from the contrast contract and noted as debt.

**Focus.** Every interactive element has a visible `:focus-visible` indicator: `--size-focus-ring` solid `--accent-primary` at `--size-focus-offset`, which clears 3:1 against every surface token. Focus is never removed, never replaced by a color-only change, and never clipped - containers with `overflow: hidden` (the reel, the tab strip, list bodies) use inset rings. Focus order equals DOM order equals reading order (StyleGallery Layout Principle 2).

**Keyboard.** The entire product is operable without a pointer. Terminal focus is the default. `Escape` closes the topmost overlay. Tabs use arrow-key roving tabindex; the key toolbar uses arrow-key roving tabindex. Dialogs and the drawer trap focus and restore it to the trigger on close. No keyboard trap exists outside an intentional modal. Application-level shortcuts are registered only while the terminal is *not* focused, so they can never shadow a key sequence the shell expects.

**Touch targets.** Minimum `--size-tap` (44px) on both axes for every interactive element below `--bp-md`, including per-row file actions, the toast close button, and every key cap. Adjacent targets are separated by at least `--space-2`.

**Screen readers.** Landmarks: `<header>`, `<main>`, `<aside>`, `<nav>` where applicable. The connection status is an `aria-live="polite"` region, throttled. Errors are `role="alert"`. The terminal canvas carries `aria-label` plus a visually-hidden live region for screen-reader output; it is explicitly **not** a full AT-accessible terminal (see debt).

**IME (Korean) composition.** Binding rules, because styling choices break this silently:
- The terminal's hidden input and the editor textarea must never have `transform`, `filter`, `contain`, `content-visibility`, or `overflow: hidden` applied to themselves or to any ancestor between them and the composition surface. Each of these can detach or mis-position the OS candidate window.
- Composition text is never restyled mid-composition. No `text-transform`, no `letter-spacing` override, no `font-feature-settings` change on the composing element - reflowing text under an open candidate window scrambles it.
- `compositionstart` / `compositionupdate` / `compositionend` are handled explicitly; keystrokes are **not** forwarded to the VT engine while `isComposing` is true.
- The hidden input is positioned with `position: absolute` and offsets, never `transform: translate` or `opacity: 0` with zero size - it must retain a real caret box near the cursor line or the candidate window lands in the wrong place.
- Korean faces are named in both font stacks (Section 3.1) so composition does not swap metrics mid-word.
- The key toolbar never fires during composition; latched modifiers are cleared on `compositionstart`.

**Motion.** `prefers-reduced-motion: reduce` is respected everywhere (Section 6.4).

**Content stress.** Every surface survives: empty (empty-state components, Section 5.12), long label (truncation with `title`), and unbroken string (`overflow-wrap: anywhere` on file names, `min-inline-size: 0` on every shrinking grid child). The full shell reflows to one readable column at 375px with no horizontal scroll of primary content; the only inline scroll in the product is the key toolbar reel, which is intentional.

### 8.2 Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|---|---|---|---|
| Dark theme only; no light theme | Global (Section 2) | The ANSI palette is tuned for a dark background. A light theme requires re-deriving all 16 ANSI colors plus every semantic token against a light canvas, and every contrast pair re-verified. Out of scope for v1 and a poor fit for the product's context. | Revisit only if users request it. Would need a second full palette table, not an inversion. |
| `--ansi-black` is near-invisible on `--term-bg` | Terminal theme (Section 2.3) | Correct ANSI behavior; the shell owns this decision, and remapping it would make the terminal lie about its own output. | Permanent. Documented, not fixed. |
| 16px minimum font-size on mobile inputs overrides the type scale | Input (Section 5.2) | iOS Safari zooms the viewport on focus for any input under 16px, which would break the shell layout and the cursor-line guarantee. The platform wins. | Permanent until iOS changes. |
| Terminal canvas is not fully screen-reader accessible | Terminal region (Section 8.1) | ghostty-web renders glyphs to a canvas. Full AT access requires an accessibility tree the WASM engine does not currently expose. A visually-hidden live region carries recent output as a partial mitigation. | Revisit when ghostty-web exposes an a11y tree. Until then, the limitation is stated in the login page footer link. |
| No `backdrop-filter` on the scrim | Drawer / dialog (Section 7) | Blurring a live canvas is expensive on the mid-range mobile devices this app targets. A solid scrim at 64% is sufficient separation. | Deliberate rejection, not scheduled for change. |
| Swipe-to-dismiss has no keyboard equivalent | Drawer (Section 5.7) | It is a redundant fourth dismissal route; `Escape`, the close button, and scrim tap all remain. | Permanent. Not a gap. |
| Lazyweb / imagen / ui-ux-db research lanes skipped | Section 0 | Task-mandated network-cost skip; direction was pinned by an explicit brand reference. | Revisit if the visual direction is challenged. |

New debt is recorded here at the moment it is accepted. Never silently.

---

## Validation Checklist

Run after every component implementation:

- [ ] All colors reference Section 2 tokens. No raw hex outside this file.
- [ ] All font sizes match the Section 3 scale. All numbers render in `--font-mono` with `tabular-nums`.
- [ ] Spacing intent maps to a Section 4 token; browser mechanics (`minmax(0,1fr)`, `100dvh`, `clamp()`, `env()`, `ch`) stay raw.
- [ ] Every fixed dimension uses a Section 4.2 size token.
- [ ] Every interactive element has default, hover, active, focus-visible, and disabled states; lists have loading, empty, and error states.
- [ ] Depth uses tonal-shift plus hairline only. No shadow outside `--shadow-key` and `--shadow-overlay`.
- [ ] Motion uses only Section 6.1 tokens and animates only `transform` / `opacity`.
- [ ] **StyleGallery:** every scrollable region appears in the Section 4.4 scroll-ownership table, and no other region scrolls.
- [ ] **StyleGallery:** no layout primitive class carries `transition`, `animation`, `transform`, `will-change`, color, border, shadow, or typography.
- [ ] **StyleGallery:** every shrinking or scrolling grid/flex child carries `min-inline-size: 0` or `min-block-size: 0`.
- [ ] **StyleGallery:** fixed command regions (top bar, key toolbar, tab strip) are outside the body scroll container.
- [ ] Z-index comes from the Section 4.3 scale. No arbitrary values.
- [ ] Safe-area insets applied via the Section 4.3 tokens on the top bar, key toolbar, drawer, and mobile dialogs; never on the terminal region.
- [ ] Touch targets >= `--size-tap` below `--bp-md`.
- [ ] Contrast verified against Section 8.1 for any new pair.
- [ ] IME rules (Section 8.1) hold: no `transform` / `filter` / `contain` on the composition path, no restyle mid-composition, keystrokes suppressed while `isComposing`.
- [ ] Reduced-motion path exists and preserves every state signal.
- [ ] Survives empty, long-label, and unbroken-string content at 375px with no horizontal scroll of primary content.
- [ ] Any new debt is recorded in Section 8.2.
