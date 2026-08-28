# Popup visual and interaction contract

This is the acceptance surface for Feature 228. Pixel snapshots are evidence, but deterministic DOM/style/state assertions decide whether the screenshot is allowed to update.

## Modes

| Mode | Required observable state |
|---|---|
| player / light | paper surface, deep-green interactive role, state text, paragraph position, seek progress, previous/play-next/stop, visible speed, Player selected |
| player / dark | ink-owned surface, spring-green interactive role, same hierarchy and controls |
| first-run / light | title + both free route forms, explicit destination/permission text, no focusable player transport; full-content and real 360×550 viewport captures |
| permission repair | reason + public repair action visible, correctly labelled, and not confused with transport |
| Tools | Tools selected, working highlighting surface reachable; no summary/OCR affordance |
| Queue | Queue selected, add/remove/empty/play contract reachable; long titles truncate/wrap without hiding actions |
| populated/exhausted account state | cost/credits readable; exhausted state uses text/icon plus semantic color, never brand green alone |
| keyboard focus + reduced motion | visible focus in both themes; no nonessential animation/transition |

## Structural assertions

- exactly one selected popup tab and one visible tab panel;
- play/pause is the only `.proso-popup__transport-primary` control;
- previous, next, stop, progress seek, and speed slider are visible in player mode;
- every critical icon button has an accessible name and a minimum 44×44px target; the sole primary transport is 56×56px;
- status text is visible and live on the unfilled page surface; the colored dot is supplementary;
- `#summarize-section`, `#summarize-btn`, `#summary-display`, and summary-only element references do not exist;
- first-run route controls preserve public names and hide player transport from layout/focus;
- a fixed 360 CSS-pixel intrinsic width gives Firefox a nonzero toolbar-panel measurement; a `100vw` cap is forbidden statically and by a 200px provisional-viewport probe because the initial ~20px viewport collapses tabpanels;
- 200% browser zoom with the corresponding expanded outer viewport preserves all transport without horizontal overflow or obscured focus;
- light/dark captures of the same view differ deterministically and report the expected computed theme roles;
- reduced motion removes nonessential transition/animation duration.

## Style assertions

- loaded popup role variables include ink `#010616`, tracked vector-system paper `#F8F8F9`, on-ink brand `#21F299`, and on-paper interactive `#006B4F`;
- the executable pair matrix permits spring-green-on-ink and deep-green-on-paper, and rejects spring-green-on-paper plus deep-green-on-ink;
- computed foreground/background and control-border/surface pairs are measured on real rendered elements in both themes: text ≥4.5:1 and meaningful button, seek, speed, input, and select boundaries ≥3:1;
- semantic success/warning/error/info are separate from brand roles; populated/exhausted credit state is never communicated by brand green alone;
- neutral Queue counts use the action role rather than the error role and are rendered in the long-title fixture;
- production popup CSS and built popup JavaScript contain no direct forbidden effects; a computed-style sweep additionally proves that no loaded legacy token resolves to a gradient, internal shadow, backdrop filter, brightness/blur/drop-shadow filter, or equivalent rendered escape hatch;
- popup width is the explicit intrinsic role (`360px` default), not `100vw`, `min(..., 100vw)`, or another viewport-relative cap;
- no looping animation runs in ready/playing/paused state;
- tabs are not enclosed in a filled rounded segmented-control container;
- status, cost, and credits are not three visually equivalent filled cards;
- box shadow is reserved for a one-pixel/low-blur popup boundary or browser chrome; internal controls use borders/contrast/focus rather than glow;
- each theme exposes a visible focus-ring role with an allowed AA contrast pairing;
- weak separator and strong control-boundary roles remain distinct.

## Behavior preserved

The visual suite does not replace behavior tests. Existing tests/public actors remain authoritative for:

- state broadcasts and play/pause/stop;
- seek, speed, paragraph navigation;
- first-run local-host/BYOK setup and permission repair;
- Player/Tools/Queue controller and keyboard movement;
- Queue add/remove/play;
- cost/credit visibility rules;
- loaded Firefox playback and page highlighting.

A screenshot cannot waive a failure in any of those checks.
