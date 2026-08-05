# Analysis — Feature 096

## Ownership

- Role: 💻 Code (`gpt-5.6-sol`)
- Worktree: `/home/notroot/Documents/Code/personal/proso-82-extension-402`
- Branch: `096-tts-boundary-hardening`
- Preserved worktrees: Feature 093 is Quality-owned; Feature 095 is Product-owned.

## Hypothesis and falsifier

The user-visible 402 bug is caused by `ServerTtsAudioAdapter` classifying every
non-429 `server_error` as `network`, after which `audio.generate` prefixes the
server's entitlement message with `Network error:`. Mapping only 402 to a
dedicated audio error and preserving that message fixes the classification.

The hypothesis is false if a 402 still reaches the handler as `network`, the
handler or public popup changes the server remedy text, the popup remains
loading/playing, 429/503 mappings regress, or request 31 reaches the provider in
the same throttle window.

## Research and trace

1. **Codebase**: `ProsoApiAdapter.toApiClientError()` preserves status, message,
   and code; `ServerTtsAudioAdapter` on `origin/main` special-cases 429 only;
   `getAudioErrorMessage()` prefixes `network` errors.
2. **History**: PR #81 added the Free-tier `managedTts` gate and its 402 but did
   not change the extension error mapping. Browser TTS was removed earlier and
   project guidance forbids restoring it casually.
3. **Docs/constitution**: INV-001 says Free needs no account and INV-002 keeps
   BYOK on every tier, but neither invariant promises managed synthesis without
   a key. Current reading docs nevertheless claim no-key Free reading, creating
   a product contradiction rather than authority to change pricing here.
4. **Exact-symptom web search**: three SearXNG queries produced no Proso-specific
   match. Generic results describe 402 as payment/entitlement-related rather
   than a transport failure; RFC 9110 retains the code for future use. This is
   background only—the repository trace is the causal evidence.
5. **Suspect-surface diff**: the relevant `origin/main` adapter branch has no
   402 case, while the staged branch adds exactly that case. The server text is
   the only core behavior change required for the removed browser-TTS remedy.
6. **Throttle wiring**: `RateLimitModule` configures only named `short`,
   `medium`, and `long` throttlers. The staged `default` method metadata is not
   read for those names, so voice discovery and the adjacent `test-key` method
   fall back to the global 100/minute long window instead of their intended 30
   and 5 request limits.

## Product review incorporated

The Feature 093 Product review is `BLOCK`: its Firefox smoke dispatches an
internal shortcut handler and does not prove public accessible controls,
anomaly/restart/soak campaigns, or one replayable receipt. More importantly,
current Free entitlements reject managed TTS while browser speech is absent.
Feature 096 therefore improves refusal semantics only and cannot be used as
evidence that fresh no-key reading works.

The Product acceptance review dated 02/08/2026 is binding: internal
`operation_failed` and reflection assertions are supplementary. Delivery also
requires an observed public popup refusal state and an HTTP-observed 429 that
does not call the provider.

## Smallest implementation

- Reuse `ApiClientError.status`; no shared schema change.
- Add one `AudioError` variant and factory.
- Add one adapter branch and one handler branch.
- Correct one existing server message.
- Reuse the installed named Nest throttler on the two existing anonymous
  provider-backed methods.
- Extract the popup's existing failure-state DOM update into one testable pure
  function; do not restructure the entrypoint.

No dependency, abstraction, persistence change, or framework import in core is
needed.

## Verification status — 02/08/2026

- **RED**: the popup regression could not resolve the missing failure-state
  function; the Free managed-copy assertion received the obsolete commercial
  promise; and an HTTP request 31 reached the provider with status 200 while
  the controller used `default` metadata.
- **GREEN**: 66 focused extension assertions and 40 focused server assertions
  passed. The latter exercises a real ephemeral Nest HTTP listener and proves
  voice request 31 and key-test request 6 are 429 while provider invocation
  remains at 30 and 5, respectively.
- **Static**: touched-file Biome checks and both extension/server TypeScript
  checks pass. Prisma generation was required in this inherited worktree; the
  repository script succeeded through its NixOS engine fallback.
- **Public-browser limit**: Code has asserted the rendered popup DOM effect and
  wired it into the public click handler. Exact-HEAD observation through the
  Firefox browser action remains Quality-owned and must stay unclaimed until
  that receipt exists.
