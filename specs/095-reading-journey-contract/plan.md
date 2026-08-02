# Plan — Feature 095

## Hypothesis and falsifier

**Hypothesis:** the current real-Firefox evidence is a valid downstream reader
diagnostic but is insufficient user-acceptance evidence because its actor calls
an internal command dispatcher rather than a public control.

**Falsifier:** a retained run in which the actor uses only public controls and
the single receipt deterministically proves every outcome in `spec.md` without
an internal handler, message, storage, or shortcut-dispatch call.

## Delivery plan

1. Preserve `smoke-reading` as an explicitly diagnostic command and remove any
   acceptance language that promotes it to public-actor proof.
2. Identify a public, keyboard-reachable control surface that can operate the
   active article without changing the reader's selected tab.
3. Build a real-Firefox actor trace using only that surface, while the observer
   controls only fixture/profile/log setup and collection.
4. Add deterministic public-control, invariant, anomaly, seeded fuzz, restart,
   and bounded soak assertions.
5. Emit and validate one sanitized receipt containing every field in REQ-007.
6. Run the focused red/green regressions, `make verify`, the outcome gate, and
   a different-family review before delivery.

## Architecture and privacy constraints

- The extension's core remains framework-free; browser and fixture behavior
  stays at adapter/test boundaries.
- A public test surface must not weaken the sticky footer's page-isolation
  boundary merely to make its closed shadow DOM inspectable.
- Fixtures contain deterministic synthetic article text and redacted request
  records only. No account, production credit, provider key, or page content is
  used.
