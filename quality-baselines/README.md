# quality-baselines — the ratchet

A suppression here is a **decision with an expiry date**, not a way to get to
green. ADR-001 §4.4 is explicit: a failing policy blocks the apply rather than
being waived. This directory is the only sanctioned exception, and it is
designed so that using it is more work than fixing the finding.

Mirrors the convention in the Proso repo's `quality-baselines/`
(`osv.json`, `audit-allowlist.json`): machine state and human justification in
separate files, cross-checked by a script that runs in CI.

## Files

| File | Half | Written by |
|---|---|---|
| `checkov-baseline.json` | machine — *which* findings are suppressed | `scripts/gate.sh --write-baseline` |
| `accepted-findings.json` | human — *why*, *who*, *until when* | you, by hand |

Trivy has no baseline file. Its findings on this repo are currently zero, and a
suppression there would go through the same review as a Checkov one — add a
`trivy-ignore.yaml` and extend `scripts/check-baseline.sh` at that point rather
than pre-building an unused escape hatch.

## What `scripts/check-baseline.sh` enforces

It runs as the **first** stage of `scripts/gate.sh`, so a rotten suppression
fails the build even when the code is clean:

1. Every check id in `checkov-baseline.json` has an entry in
   `accepted-findings.json`. Suppressing without documenting fails.
2. Every entry has an `owner` and a `reason` of at least 80 characters.
   "not applicable" is not a reason; the check exists because it usually is
   applicable, so the entry has to say what is different here.
3. Every entry has a `reviewDate` in `YYYY-MM-DD`, and **an expired date is a
   build failure**, not a warning. Acceptance rots; the pipeline notices.
4. Nothing is documented that is no longer suppressed. Once a finding is fixed,
   its row must go, or the file slowly becomes fiction.

`scripts/falsify-gates.sh` assertion **D** proves rule 1 still bites, by
injecting a fake check id into the baseline and requiring the gate to reject it.

## Adding an entry

```bash
nix develop -c scripts/gate.sh --write-baseline   # regenerate the machine half
$EDITOR quality-baselines/accepted-findings.json  # write the human half
nix develop -c scripts/gate.sh                    # must be green before committing
```

Do this only after answering, in the PR description, why the finding cannot be
fixed. If the answer is "it would take a while", fix it.

## Renewing an expired entry

Re-derive the evidence — do not just move the date. If the reason still holds,
say what you re-checked and when; if it no longer holds, delete the entry and
fix the finding.

## Current entries

| Check | Why it is accepted | Review by |
|---|---|---|
| `CKV_AWS_144` | Cross-region replication on a 1.06 MB static-site origin bucket rebuilt from git on every deploy. The buckets holding irreplaceable data are the restic backup buckets in the management account, protected by Object Lock. | 2027-02-25 |
| `CKV2_AWS_62` | S3 event notifications with no consumer. The audit control this check proxies for is CloudTrail data events in `10-account-baseline`. | 2027-02-25 |
