# Feature 228 — Deliberate popup design

## Problem

The Proso popup works, but it presents the reader as a generic SaaS control panel instead of a focused reading instrument:

- segmented pill tabs, status card, cost card, gradient progress, and a glowing/scaling primary button give equal visual weight to unrelated information;
- state and paragraph position use tiny low-contrast text while decorative surfaces dominate;
- the popup carries a complete hidden AI Summary surface that the product cannot use;
- CSS relies on literal fallback values rather than one loaded role contract;
- the palette does not use Proso's canonical identity and disagrees with both settings and the site;
- static captures show a large unused lower region rather than an intentional compact tool.

The problem is not any single color or radius. Visual decisions do not consistently encode the reader's task: understand current state, start or control speech, adjust speed, and reach queue/tools/settings without losing context.

## Goal

Make the popup a compact, calm current-page transport that looks intentionally Proso: clear state, one state-dependent primary transport action, visible speed, one-click access to Tools and Queue, factual trust/recovery text, and a role-based light/dark visual system derived from the canonical identity.

No playback, storage, provider, permission, accounting, or queue behavior changes.

## User stories

### US1 — Current playback is obvious

As a reader opening Proso, I can identify the current state, page position, progress, play/pause action, paragraph controls, stop, and speed in one scan.

**Independent test:** open the built popup in player mode in light and dark themes; a deterministic visual/DOM contract identifies one state-dependent primary button, visible speed, status text, paragraph position, progress, and labelled controls without horizontal overflow at 200% zoom.

**Falsifier:** state is expressed only by color/animation; speed or stop is hidden; a decorative card/glow is more prominent than transport; zoom clips a control or causes horizontal scrolling.

### US2 — A new reader sees two honest routes, not a dashboard

As a reader with no configured route, I see the existing local-host and BYOK choices as a short setup sequence, with destination and permission consequences stated plainly.

**Independent test:** render first-run mode and assert both route forms remain keyboard reachable, their labels/status regions exist, the exact destination copy remains, and the transport-only UI is absent while setup is active.

**Falsifier:** either route disappears; page-text destination becomes ambiguous; route cards compete as promotional feature tiles; hidden transport controls remain focusable.

### US3 — Queue and tools remain one action away

As an existing reader, I can still reach Player, Tools, and Queue directly. The popup does not move Queue to settings or hide core functions behind an unlabelled overflow menu.

**Independent test:** the production tab controller retains click and ArrowLeft/ArrowRight/Home/End behavior, one selected tab, one visible panel, and no playback mutation.

**Falsifier:** a panel becomes more than one action away; tab semantics/keyboard behavior regress; visual simplification deletes working Queue or highlighting controls.

### US4 — The popup communicates trust without promotional AI language

As a reader, I see factual provider/permission/cost or credit state when relevant and actionable errors when unavailable. Dead or unverifiable AI features do not appear in markup, focus order, or copy.

**Independent test:** dead summary elements and handlers are absent; cost/credits remain hidden when unavailable and readable when populated; permission and route failures retain their existing actions; accessibility checks find no critical/serious violations.

**Falsifier:** removing “AI” copy removes required cloud/local disclosure; cost/credits disappear for users who need them; dead controls remain hidden by runtime code instead of being deleted.

## Requirements

- **REQ-001 — Brand roles:** popup colors MUST use named popup roles derived from canonical ink `#010616`, paper `#F7F7F2`, spring green `#21F299` on ink, and accessible deep green `#006B4F` on paper. The permitted foreground/surface pair matrix and computed contrast MUST be executable; deep green on navy and spring green on paper are explicitly forbidden. Brand roles are non-semantic. Error/warning/info/success keep independent text/icon roles.
- **REQ-002 — Contrast:** text, focus, and meaningful control boundaries MUST meet WCAG 2.2 AA. Spring green MUST NOT be used as text or a boundary on the light paper surface; deep green MUST NOT be used as text or a boundary on the ink surface. Low/exhausted credit and failure state MUST use text/icon semantics in addition to color and MUST NOT reuse brand green as “success.”
- **REQ-003 — No decorative effects:** popup production CSS and built popup JavaScript MUST contain no gradient, accent glow, backdrop blur, drop-shadow/blur filter, ambient pulse, or hover scale. Ordinary one-pixel boundary/elevation shadows MAY be used only for the popup/browser boundary, not internal glow. Motion is limited to state feedback and obeys reduced motion.
- **REQ-004 — Hierarchy before containers:** tabs, status, speed, cost, and credits MUST use spacing/type/separators before filled card containers. A bordered/filled container is reserved for first-run routes, a bounded error/recovery action, or an independently scrollable queue.
- **REQ-005 — Transport state:** play/pause remains the state-dependent primary control; previous, next, stop, progress/seek, and speed stay visible and labelled.
- **REQ-006 — Scope preservation:** Player, Tools, Queue, settings, highlighting, queue add/remove/play, permission repair, first-run local host, first-run BYOK, cost, and credits retain behavior and public names unless this spec explicitly changes copy.
- **REQ-007 — Dead surface removal:** hidden AI Summary markup, element references, and popup-only summary styling MUST be deleted rather than kept behind `hidden`.
- **REQ-008 — Popup contract:** the document MUST retain a fixed 360 CSS-pixel intrinsic width because Firefox derives toolbar-panel width from the document; capping it with `100vw` during initial intrinsic sizing collapses the panel to ~20px and its tabpanels to zero. Normal player mode SHOULD use its space intentionally; content may scroll only when real content exceeds 550px. At 200% browser zoom Firefox may expand the outer panel physically; all transport remains visible with no horizontal scrolling.
- **REQ-009 — Accessibility:** native controls, accessible names, explicit tab/tabpanel roles, visible focus, 44×44px minimum targets for primary transport/critical icon actions, ArrowLeft/ArrowRight/Home/End tab behavior, live status, 200% zoom, and reduced-motion behavior MUST remain covered. Each theme MUST have a keyboard-focused visual state whose focus ring uses an allowed contrast pairing.
- **REQ-010 — Light/dark parity:** light and dark variants MUST express the same hierarchy and semantics. Dark mode uses spring green only on owned ink surfaces; light mode uses deep green. The same-mode screenshots MUST be deterministically distinct, proving the harness applied the theme rather than blessing duplicate light renders.
- **REQ-011 — Visual evidence:** deterministic popup evidence MUST cover player light, player dark, first-run, keyboard focus, permission repair, Queue with a long title, and populated plus exhausted credit/cost states. Not every state needs a separate pixel baseline when a deterministic DOM/style assertion is stronger, but both first-run routes and every named state MUST be exercised. Missing selectors/build/browser are blocking, never skipped green.
- **REQ-012 — Real browser:** the existing built-extension public actor MUST still reach local-host playback, decoded audio, visible highlight, tab behavior, and zero managed synthesis calls in real-host mode.
- **REQ-013 — No new dependency:** use existing HTML, CSS, TypeScript, WXT, and test tooling; no runtime **or development** dependency, component library, icon package, or design runtime is added.
- **REQ-014 — No cross-surface claim:** this feature documents the settings/footer/site roadmap but changes only the extension popup plus shared additive color-role tokens needed by that popup.

## Non-goals

- Redesigning settings, the sticky footer, content highlighting, or the marketing site.
- Changing the canonical mark/wordmark.
- Moving Queue to a sidebar or adding a new browser surface.
- Adding usage analytics; Proso forbids telemetry and behavioral tracking.
- Changing playback/provider/storage/accounting behavior.
- Replacing specific processing disclosures with vague “private” or “local” claims.
- Regenerating unrelated settings/footer/site baselines.

## Acceptance criteria

1. Current and replacement popup screenshots are reviewable in the feature diff.
2. Player light/dark and first-run visual contracts pass against the built popup.
3. Plants that restore a gradient/glow/filter/scale, remove status/speed/Queue/focus, violate the foreground-surface pair matrix, collapse light/dark into the same render, or replace the fixed intrinsic width with a `100vw` cap make the relevant static or loaded-Firefox contract fail.
4. Popup unit/accessibility suites (including production-controller ArrowLeft/ArrowRight/Home/End focus), built-popup role/style assertions, seeded fuzz, `make verify`, and the loaded-Firefox real-host journey pass.
5. A different-family review finds no unresolved requirement, accessibility, or reward-hacking defect.
6. PR is green/review-clean, squash-merged, and the tracker/save-state record distinguishes this popup slice from the remaining facelift roadmap.
