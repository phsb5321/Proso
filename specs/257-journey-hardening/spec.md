# Feature 257 — Background journey oracle hardening

The loaded-Firefox diagnostic must distinguish a hidden source from elapsed
sleep, a policy stop from absent/ended/failed audio, and a freshly built checkout
from discovered output. Product code is outside this slice.

Acceptance:

- Preserve `make background-playback-journey` and enabled/disabled scenarios,
  each with hidden, navigation and reload phases.
- Retain a continuous visibility-change history for the 90-second quiet window
  and selected/active tab snapshots. Reselecting the source invalidates it.
- Each leave starts with observed advancing native audio with at least 15 seconds
  remaining. A stop requires the same observable background/audio identity, a
  native pause/source-release event within three seconds and cleared source; absence, natural completion or
  decode failure cannot stand in for a stop.
- Use 35-second paragraph clips. Enabled continuation requires natural media
  completion, playback of a different source, and an ordered highlighted
  paragraph change within the hidden window, plus aggregate audio advancement.
- Rebuild clean product inputs at HEAD; retain built commit, source tree,
  output hashes and exact harness hashes. Uncommitted harness changes are named
  separately and cannot masquerade as committed product input.
- Teardown precedes evidence writes, even when those fail. WebDriver DELETE has
  a five-second deadline, including response-body consumption.
- Missing prerequisites yield BLOCKED. No push or product changes.
