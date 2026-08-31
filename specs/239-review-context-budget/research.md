# Feature 239 — Evidence

For Feature 229, `scripts/change-bundle.sh` produced 51,234 bytes. The unchanged
`docs/agent-delivery-harness.md` and `Makefile` added another 30,726 bytes before
schema/prompt framing, for at least 81,960 bytes. Claude returned a structured
CLI error with `result: "Prompt is too long"` before any verdict.

Both repo-aware review commands already run in the candidate repository:
Claude inherits the worktree, and Codex receives `--cd "$REPO_ROOT"` with a
read-only sandbox. Meta uses one HTTP completion and therefore still needs
unchanged content inline.

## Post-fix self-test

The isolated fake-Anthropic prompt contains the complete candidate marker plus
`Makefile` and `docs/agent-delivery-harness.md` path references, but excludes a
unique marker appended only to the unchanged runbook body. The fake Meta HTTP
prompt contains both the candidate marker and the unchanged-body marker. Both
responses are deliberately malformed and rejected without contacting a
provider.
