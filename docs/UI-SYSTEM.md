# Proso UI System

**Owner**: proso · **Established**: 12/08/2026 (PROSO-130) · **Scope**: every
user-visible surface in `packages/extension` (popup, settings, content-script
reader) and the rules that keep them from rotting.

This file exists because the settings UI broke systemically — content script on
extension pages, two raw z-index guesses, baselines that could not see styling,
dropdown and storage disagreeing — and four point-fixes without the rules would
mean doing it again next week. The three rules below are the system.

---

## Rule 1 — The layering scale: tokens, never numbers

Every `z-index` in shipped CSS comes from the scale in
`packages/extension/src/styles/tokens.css`. The scale:

| Token | Value | Layer | Example |
|---|---|---|---|
| `--z-base` | `auto` | Normal document flow | default |
| `--z-elevated` | `1` | Hover states, focus rings | raised interactive elements |
| `--z-dropdown` | `50` | Dropdowns, tooltips | provider dropdown |
| `--z-sticky` | `60` | Sticky headers, sidebars | settings sidebar |
| `--z-popover` | `80` | Floating panels above cards | server-status detail, hint popovers |
| `--z-overlay` | `100` | Modal scrims/backdrops | modal overlay backdrop |
| `--z-modal` | `100` | Modal surfaces (canonical) | confirm dialog |
| `--z-overlay-content` | `101` | Content within overlays | modal inner panels |
| `--z-toast` | `200` | Toast notifications | save toasts |
| `--z-max` | `2147483647` | Page chrome that must win | content-script footer, page toasts |

### Two contexts, two forms

1. **Extension pages** (popup/options/settings — tokens.css IS loaded):
   `z-index: var(--z-popover);` — bare token, no fallback.
2. **Content-script styles injected into arbitrary web pages** (tokens.css is
   NOT loaded there): `z-index: var(--z-max, 10000);` — token + literal
   fallback. The fallback is the value the page actually sees; the token name
   records the intended layer for anyone who later defines tokens in page
   context. Never a bare number in either context.

### Enforcement

The opengrep rule `proso.raw-numeric-z-index`
(`.opengrep.yml`, run by `scripts/opengrep-check.sh` in `make semantic`) fails
on any `z-index: <number>` in `.github/workflows packages services` — including
`.ts` template strings and test fixtures. Proof it fires lives in
`scripts/quality/fixtures/opengrep/raw-z-index.css` with an exact-count
self-test. Adding a new layer means extending the token scale, not inventing a
number.

### Why the popover sits at 80 (PROSO #17)

The server-status detail popover was `z-index: 10` — a guess with no layer
above the cards, so it painted under them. The scale names the layer: popover
(80) is above cards (base) and below any overlay/modal. The modal at 1000 was
likewise a guess; it now reads `--z-modal` (100) — still above everything
except toasts.

---

## Rule 2 — The extension-page boundary: enforced, not remembered

The content script must never run on the extension's own pages.

- **Manifest**: `matches: ['<all_urls>']` MUST carry
  `exclude_matches: ['moz-extension://*/*', 'chrome-extension://*/*']`
  (`entrypoints/content.ts:417`).
- **Runtime guard**: `main()` early-returns on
  `location.protocol === 'moz-extension:' || location.protocol === 'chrome-extension:'`
  — belt and braces. The manifest key is the real fix; the guard survives a
  manifest refactor.
- **Test**: a test fails if either is removed. The observable symptom of the
  violation: `.proso-play-icon` or `#proso-content-styles` present in the
  settings DOM (the pink play triangle over the settings page).

Why it matters: the content script stamps paragraph affordances and injects
`!important` styles (`margin-left: -15px`, `scroll-margin-top: 80px`, teal
gradient) that are correct on articles and destructive on the extension's own
UI — a ~250px dead band above the settings header was that injection landing
on a page never meant to host it.

---

## Rule 3 — One derived state per user-visible choice

Every user-visible choice has exactly ONE source of truth; every control that
shows it is derived from that source, never an independent copy.

**The provider choice** (the case that shipped broken): the Quick Settings
provider dropdown, the Local synthesis host section, and the stored `provider`
value are one state. The dropdown reads the stored value; the local-host
section writes it; nothing else holds a second copy. A test asserts the three
cannot disagree.

General form of the rule:

1. Storage (e.g. `provider: 'local'`) is the source of truth.
2. Every visible control that reflects it reads from the same derived state —
   one selector, one subscription, one render path.
3. A test plants each possible stored value and asserts every surface shows it
   consistently (falsifier: any two surfaces disagreeing on the same stored
   value).
4. A new choice gets a derived state; a new control over an old choice gets
   wired to the existing derived state — never a parallel one.

---

## Related

- Design tokens (colors, spacing, type): `packages/extension/src/styles/tokens.css`
- Icon system + generator: `docs/research/icon-design-conventions.md`
- Enforcement location: `scripts/opengrep-check.sh`, `.opengrep.yml`
