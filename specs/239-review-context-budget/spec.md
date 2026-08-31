# Feature 239 — Bound repo-aware review prompts

## Problem

The adversarial prompt always inlines the full Makefile and delivery runbook.
For a 51 KB feature diff this raises the prompt to roughly 82 KB, and Claude can
refuse with `Prompt is too long` before returning any verdict—even though Claude
and Codex can read unchanged repository files themselves.

## Goal

Keep every changed byte inline, but give repo-aware reviewers unchanged context
as required live paths. Preserve full inline context only for the tool-less Meta
fallback.

## Requirements

- REQ-1: The complete tracked-plus-untracked change bundle remains inline for
  every reviewer family.
- REQ-2: Anthropic and OpenAI prompts list every required unchanged context path
  and instruct the reviewer to read it with read-only tools.
- REQ-3: Meta prompts still inline each required file's full content because
  that lane has no repository tool loop.
- REQ-4: Missing/unreadable required files still fail before reviewer launch.
- REQ-5: The provider-free self-test proves the repo-aware prompt contains path
  references but not a unique marker placed only in unchanged file contents.

## Acceptance

`make adversarial-self-test` passes. Its captured fake-Anthropic prompt names
`Makefile` and `docs/agent-delivery-harness.md`, contains the complete candidate
diff, and excludes the unchanged context marker.
