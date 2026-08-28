# Research — Proso design coherence reset

**Date:** 28/08/2026
**Method:** live source audit, deterministic headless captures, existing Firefox visual baselines, product-history review, and public-web research through Pedro's SearXNG first.

## Decision

Keep the existing Proso identity. Replace the generic SaaS/admin styling around it with a quiet reading instrument, one surface at a time:

1. popup — the current page and its playback state;
2. settings — preferences grouped by reader intent;
3. page player — dependable transport on arbitrary content;
4. marketing — real product evidence after the product surfaces ship.

The first deliverable is the popup. It is the highest-frequency surface, stays within one deployable, and can be accepted through the existing loaded-Firefox public actor. Settings, page player, and site remain separate reversible slices.

## What the current product says visually

### Captured evidence

| Surface | Evidence | SHA-256 |
|---|---|---|
| Built popup, 360×550 | `evidence/current-popup.png` | `4449bf083173fec4fc99d27d1bf24ab5319df8198463f05e78607be1830b1337` |
| Source marketing page, 1440×1200 | `evidence/current-site.png` | `d0c75d2f21c54d9ad83fa3c9badd75994cbf308d5a978281010bd17bad4cf92f` |
| Settings, light/dark | `packages/extension/tests/visual/settings-page.test.js-snapshots/` | tracked visual baselines |
| Page transport, light/dark | `packages/extension/tests/visual/sticky-footer.test.js-snapshots/` | tracked visual baselines |
| Canonical identity | `brand/source/proso-brand-board.png` | pinned by `brand/segments.json` |

The captures use the built extension/site sources. The popup capture is an isolated headless Firefox profile, not Pedro's daily profile.

### Measured inconsistencies

- Canonical brand: navy `#010616`, spring green `#21F299`, off-white, Outfit-derived wordmark.
- Extension UI: generic slate/teal `#1a1a2e`, `#16213e`, `#0d9488`, `#14b8a6`.
- Marketing: unrelated amber/cyan `#f59e0b` and `#06b6d4`, including gradient headline text.
- Typography: site Fraunces + Inter; extension system UI; brand Outfit. Three systems accumulated without an explicit role contract.
- Popup stylesheet: 1,379 lines, 37 radius declarations, two gradients, glow/scale effects, card-like tab/status/cost surfaces, and 28 buttons in markup.
- Settings: sidebar plus nine card/accordion sections; the page says changes save automatically while also showing **Save Settings**; footer still says `Proso v1.0.0 - AI-Powered Page Reader`.
- Popup still carries a complete hidden **AI Summary** DOM/CSS implementation even though runtime code always hides it.
- Site uses the generic headline “Listen to the web. Your way.”, gradient type, a fake browser frame, feature/pricing card grids, and “premium AI voices” rather than showing the real reader.
- Popup comments claim shared token inheritance, but `popup.html` loads only the generated popup bundle; the CSS currently survives through literal fallbacks rather than one loaded token contract.

These are structural signals, not a claim that rounded corners or gradients are inherently bad. They become a problem because they do not encode reader tasks, differ by surface, and hide stale product state.

## Public research

Discovery used SearXNG with three query angles: generated/generic interface patterns; reader/listening competitors; Firefox/WCAG/design-system guidance. Some engines were rate-limited, so the search was retried with simpler queries and conclusions were checked against canonical sources.

### Canonical sources

Accessed 28/08/2026:

- Firefox Extension Workshop, user-experience best practices: <https://extensionworkshop.com/documentation/develop/user-experience-best-practices/>
- MDN, browser-action popups: <https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/user_interface/Popups>
- WCAG 2.2: <https://www.w3.org/TR/WCAG22/>
- WAI accessible media players: <https://www.w3.org/WAI/media/av/player/>
- WAI animation from interactions: <https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html>
- Carbon spacing system: <https://carbondesignsystem.com/elements/spacing/overview/>
- Readwise Reader: <https://readwise.io/read>
- Matter: <https://www.getmatter.com/>
- ElevenReader: <https://elevenreader.io/text-reader-app>
- Speechify text reader: <https://speechify.com/text-reader/>
- Readeck: <https://readeck.org/>
- Muzli, “Vibe Design in 2026”: <https://muz.li/blog/vibe-design-in-2026-what-ai-generated-ui-means-for-your-work/>
- ACM CHI 2026, generative design and vibe coding: <https://dl.acm.org/doi/10.1145/3772363.3778802>

Trend commentary informed the vocabulary only. Product and platform decisions below rest on canonical product, Mozilla, WAI/WCAG, and existing Proso evidence.

## Generalizable findings

1. **One surface, one immediate job.** Firefox recommends a toolbar popup for immediate actions and an options page for preferences. A popup closes on focus loss and reloads on every open; it should not become a settings dashboard.
2. **Reading and listening share state.** Reader, Matter, Speechify, and ElevenReader foreground progress, synchronized text, speed, queue/continuity, and resume—not provider architecture.
3. **Hierarchy comes before containers.** Carbon's spacing discipline and WAI's heading/focus guidance support grouping through type, space, and separators. A card is reserved for a genuinely independent object or bounded action.
4. **Transport is a state machine.** Play becomes pause/retry/restart. Speed remains visible because it is a core TTS control; “one primary action” does not mean hiding transport state.
5. **Trust is product UI.** Destination, permission, provider availability, cost/credits, and recovery must be stated in plain language. Removing decorative “AI” language must not remove factual cloud/local processing disclosures.
6. **Motion is feedback only.** Respect reduced motion; no ambient pulse/glow while reading. Current state is expressed with text and semantics, not color or animation alone.
7. **Real product evidence follows product work.** Marketing screenshots must be captured from shipped surfaces. Replacing the fake browser before the product UI ships would only preserve the same mismatch with better polish.

## Competitor pattern table

| Product | Pattern worth retaining | What Proso should not copy |
|---|---|---|
| Readwise Reader | reading/listening continuity, position, keyboard workflow | full knowledge-management density inside a popup |
| Matter | text/audio shared state and queue continuity | consumer-media decoration without transparent processing state |
| ElevenReader | import/start clarity and voice preview | voice catalog as the first thing every user must configure |
| Speechify | visible speed and synchronized highlighting | feature sprawl and promotional claims before the task |
| Readeck | restrained content-first/self-hosted trust | turning the extension into a full read-later service |

## Palette and typography roles

“Use the brand” does not mean putting spring green on white. Measured contrast:

- `#21F299` on `#010616`: **13.69:1** — valid dark-surface brand accent.
- `#21F299` on `#F8F8F9`: **1.39:1** — unusable for text/control boundaries.
- derived deep green `#006B4F` on `#F8F8F9`: **6.15:1** — valid light-surface action/text accent.
- navy `#010616` on `#F8F8F9`: **19.04:1**.

Role contract:

- ink: `#010616`;
- paper: `#F8F8F9`, matching `brand/PROVENANCE.md` and the Feature 161 vector contract;
- surface: white/light or navy/dark;
- brand signal on ink: `#21F299`;
- interactive accent on paper: `#006B4F`;
- semantic warning/error/info retain their meanings and do not become green;
- system UI for product controls; Outfit remains the identity wordmark; marketing typography is decided in its own slice rather than imported into the extension.

## Skeptical-review corrections accepted

A cross-family critique identified useful failure modes:

- use the tracked vector-system paper `#F8F8F9`; a provisional `#F7F7F2` would create a second source of truth;
- do not apply spring green unchanged on light surfaces;
- do not hide speed in pursuit of one primary action;
- retain Queue and Tools one click away until a replacement surface exists (telemetry is forbidden by the constitution, so no analytics experiment decides this);
- give the page player an opaque owned surface because it sits over arbitrary pages;
- treat “quiet editorial” as a task/accessibility rule, not another aesthetic trend;
- rewrite unverifiable AI adjectives into specific voice/language/location facts rather than deleting necessary processing disclosure.

Rejected suggestion: instrumenting feature usage. Proso's constitution forbids telemetry and behavioral tracking. Decisions use task analysis, deterministic journeys, and explicit user feedback instead.

Empirical correction: the critique also assumed a 360px popup must wrap into a synthetic 180px CSS viewport at 200% zoom. Live Firefox disproved that implementation. Firefox begins intrinsic toolbar-panel measurement near 20px; `width: min(360px, 100vw)` therefore collapsed the popup to 20px and every tabpanel to width zero while children overflowed. The platform-correct contract retains a 360 CSS-pixel intrinsic width and lets browser zoom expand the outer panel physically. The loaded-Firefox actor is the authority for this boundary; a standalone narrow webpage is not.

## Rejected approaches

- **New brand/logo:** unnecessary; the bespoke identity is the strongest existing design asset.
- **Adopt a component library:** adds a dependency and another default aesthetic; current semantic HTML/CSS is sufficient.
- **Recolor only:** leaves the dashboard/card hierarchy and dead/stale surfaces intact.
- **Redesign every surface in one PR:** mixes extension and site deployment, expands review blast radius, and makes visual regressions hard to attribute.
- **Marketing first:** cannot honestly show a product UI that has not shipped.
- **Navy everywhere:** substitutes a dark-mode trend for reader comfort; light “paper” remains the default role, with dark mode equivalent.

## Delivery roadmap

| Slice | Outcome | Independent acceptance |
|---|---|---|
| 228 — Popup | calm current-page transport, retained speed/queue/tools, no dead summary or generic glow | popup visual contract + loaded-Firefox public journey |
| Settings | reader-intent IA, fewer containers, auto-save truth, processing/permissions clarity | HTTP visual suite + settings accessibility/interaction gate |
| Page player | opaque owned transport, consistent roles, no content/focus obstruction | real loaded-page stop/continue journeys + visual baselines |
| Marketing | real popup/page-player evidence, factual copy, no fake browser/gradient-card template | static plants, accessibility, responsive screenshots; production deploy separately gated |

Every style decision must cite a user task, platform constraint, or accessibility requirement. “Looks more editorial” is not an acceptance criterion.
