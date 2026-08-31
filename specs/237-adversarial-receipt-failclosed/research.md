# Feature 237 — Pre-fix evidence

A fake `claude` executable was placed first on `PATH`, a temporary untracked
candidate file made the change bundle non-empty, and `GATE_RECEIPT_PATH` pointed
to a missing file. The unchanged wrapper printed:

```text
Deterministic gate receipt is missing: .../proso-237-missing-receipt.json
Anthropic reviewer failed before returning a verdict:
exit=1 model_called=yes
```

The non-zero final status was the fake reviewer failing, not receipt validation
stopping execution. This isolates the bug from the empty-diff guard that would
otherwise stop a main-branch reproduction before reviewer launch.

## Permanent regression check

`make adversarial-self-test` now builds its own temporary Git repository and
prints:

```text
adversarial review self-test: missing receipt failed before reviewer launch
```

Reverting only the split assignment makes that same command exit 2 with
`Self-test failed: missing receipt reached the reviewer executable`. Restoring
the split returns it to exit 0. The fake executable only touches a marker; no
provider command is used.
