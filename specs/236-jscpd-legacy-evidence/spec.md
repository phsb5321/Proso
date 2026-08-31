# Feature 236 — Retain classified jscpd evidence

## Problem

The changed-code duplication ratchet correctly blocks clones touching changed
production lines, but a green run prints only a legacy-clone count and deletes
the detailed jscpd report. The delivery review contract says classified legacy
findings stay visible, so the current output cannot substantiate that claim.

## Goal

Every duplication-ratchet run leaves one current, machine-readable local
artifact that separates legacy clone groups from introduced clone groups while
preserving the file, line, format, token, and fragment evidence jscpd produced.
The blocking policy remains unchanged.

## Requirements

- REQ-1: Write `.artifacts/quality/jscpd-report.json` on both green and
  changed-clone-red runs before deleting temporary scanner output.
- REQ-2: The artifact has a versioned schema with distinct `legacy` and
  `introduced` arrays and retains each complete jscpd duplicate record.
- REQ-3: Artifact counts exactly match the current scanner report; each run
  atomically overwrites stale evidence and validates the persisted schema/counts.
- REQ-4: Any introduced clone still exits non-zero and is listed under
  `introduced`; zero introduced clones still exits zero.
- REQ-5: Do not add a suppression baseline, lower a threshold, or retain the
  temporary scan directory.

## Acceptance

1. Run `node scripts/quality/duplication-ratchet.mjs`; it exits 0 and the
   artifact parses with `introduced.length === 0`.
2. Plant one clone touching a changed production line; the command exits 1 and
   the artifact names it under `introduced`.
3. Remove the plant and rerun; the command returns to 0 and overwrites the red
   evidence with a zero-introduced report.
