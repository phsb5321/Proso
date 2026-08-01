# Feature Specification: Server-Side TTS Centralization

**Feature Branch**: `069-server-tts-centralization`
**Created**: 2026-03-01
**Status**: Draft
**Input**: Eliminate direct client-side TTS provider API calls; route all premium TTS through the Proso server. Browser TTS remains client-side and unlimited.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Managed-Credit TTS Playback (Priority: P1)

A subscribed user (Pro or Enterprise tier) clicks "Play" on a webpage. The extension extracts the page text, sends it to the Proso server, and receives synthesized audio back. The server handles provider selection, credit deduction, and caching. The user hears the audio without ever having direct contact with any third-party TTS provider.

**Why this priority**: This is the core revenue path. All paying users must be able to synthesize speech through the server. Without this, the product has no monetization.

**Independent Test**: Can be fully tested by configuring a valid license key in the extension, selecting a premium provider (e.g., OpenAI), and pressing Play on any article. Audio plays and credit balance decreases.

**Acceptance Scenarios**:

1. **Given** a Pro-tier user with sufficient credits, **When** they click Play on a webpage with OpenAI selected, **Then** the extension sends the text to the server, receives audio, and plays it back with credit balance decreasing accordingly.
2. **Given** a Pro-tier user with zero remaining credits, **When** they click Play, **Then** they see a clear error message indicating insufficient credits and are offered options to upgrade or switch to Browser TTS.
3. **Given** a Pro-tier user who plays the same paragraph twice, **When** the second playback occurs, **Then** the server returns cached audio with zero additional credit deduction (INV-006).
4. **Given** a subscribed user with no internet connectivity, **When** they click Play on a premium provider, **Then** they see a connection error and are suggested to switch to Browser TTS for offline use.

---

### User Story 2 - BYOK Key Forwarding via Server (Priority: P1)

A user who has their own API key (e.g., an ElevenLabs API key) enters it in the extension settings. When they click Play, the extension sends the text along with their API key to the Proso server. The server uses that key for a single synthesis request without storing it, then returns the audio. The user's key is never persisted server-side.

**Why this priority**: BYOK is a core value proposition (INV-002) that differentiates Proso and reduces friction for power users. Changing the mechanism (direct-to-server-proxied) without breaking the capability is critical.

**Independent Test**: Can be tested by entering a valid ElevenLabs API key in settings, selecting ElevenLabs as provider, and pressing Play. Audio plays without any credit deduction. The server logs show no key persistence.

**Acceptance Scenarios**:

1. **Given** a user with a valid BYOK ElevenLabs key stored in extension settings, **When** they click Play, **Then** the extension sends the key to the server, the server uses it for synthesis, returns audio, and does not deduct any managed credits.
2. **Given** a user with a BYOK key on the free tier (no subscription), **When** they click Play with their key, **Then** synthesis succeeds through the server proxy without requiring a paid subscription.
3. **Given** a user with an invalid BYOK key, **When** they click Play, **Then** they see a clear error indicating their API key is invalid, with guidance to check the key in settings.
4. **Given** a BYOK request for the same text that was previously synthesized, **When** the server has it cached, **Then** cached audio is returned without making a provider API call (INV-006).
5. **Given** the server receives a BYOK key in a request, **When** the request completes (success or failure), **Then** the key is not written to any database, log file, or persistent storage.

---

### User Story 3 - BYOK Key Validation via Server (Priority: P2)

A user enters a new API key in the extension settings page and clicks "Test". The extension sends the key to the server's validation endpoint. The server makes a minimal API call to the provider to verify the key works, then returns a success/failure result to the extension.

**Why this priority**: Key validation provides user confidence before attempting playback. Without it, users with typos or expired keys would only discover failures during playback, causing frustration.

**Independent Test**: Can be tested by entering a valid key and clicking Test (success feedback shown), then entering an invalid key and clicking Test (error feedback shown).

**Acceptance Scenarios**:

1. **Given** a user enters a valid ElevenLabs API key in settings, **When** they click "Test", **Then** the server validates the key and the extension displays a success indicator with response time.
2. **Given** a user enters an invalid API key, **When** they click "Test", **Then** the server returns an error and the extension displays a clear failure message.
3. **Given** a user rapidly clicks "Test" multiple times, **When** the server receives excessive requests, **Then** the server rate-limits validation requests and the extension shows an appropriate message.

---

### User Story 4 - Browser TTS Remains Fully Client-Side (Priority: P1)

A user selects "Browser" as their TTS provider. When they click Play, the extension uses the browser's built-in speech synthesis (Web Speech API) directly. No server call is made. This works offline, requires no account, and has no usage limits.

**Why this priority**: Browser TTS is the free-tier foundation (INV-005) and the offline fallback. It must remain completely unaffected by the server centralization changes.

**Independent Test**: Can be tested by disconnecting from the internet, selecting Browser TTS, and pressing Play. Audio plays without any errors.

**Acceptance Scenarios**:

1. **Given** a user with Browser TTS selected, **When** they click Play, **Then** audio is synthesized entirely on the client with zero network requests.
2. **Given** a user with no internet connection and Browser TTS selected, **When** they click Play, **Then** playback works normally.
3. **Given** a user on the free tier with no API keys and no subscription, **When** they select Browser TTS and click Play, **Then** playback works without any account or server interaction (INV-001, INV-005).

---

### User Story 5 - Extension Client Simplification (Priority: P2)

After migration, the extension no longer contains any direct TTS provider API call logic. The extension is a thin playback client: it sends text to the server and receives audio. Four direct provider adapter modules are removed from the extension codebase, simplifying maintenance and reducing the code surface area.

**Why this priority**: This is the architectural goal that enables long-term benefits (centralized control, reduced attack surface, simpler client). It's a developer-facing story that reduces maintenance burden.

**Independent Test**: Can be verified by building the extension and confirming that no direct provider adapter files exist in the output, and that all premium TTS requests route through the server adapter.

**Acceptance Scenarios**:

1. **Given** the extension is built for production, **When** inspecting the source, **Then** no direct API calls to OpenAI, ElevenLabs, Groq, or Cartesia endpoints exist in the extension code.
2. **Given** a developer searches the extension codebase, **When** looking for direct provider adapter files, **Then** only `BrowserTtsAudioAdapter` and `ServerTtsAudioAdapter` remain in the audio adapter directory.
3. **Given** the extension's factory routing logic, **When** any non-browser provider is selected, **Then** the factory always returns a `ServerTtsAudioAdapter` instance.

---

### Edge Cases

- What happens when the server is temporarily unavailable but the user has a BYOK key? The extension should display a server connectivity error and suggest retrying or switching to Browser TTS. BYOK keys cannot be used for direct calls anymore.
- What happens when a BYOK user's key becomes invalid mid-session (e.g., revoked by provider)? The server returns the provider's error, and the extension shows a clear message to re-validate the key in settings.
- What happens when the server receives a synthesis request with both a BYOK key and a managed-credit subscription? BYOK key takes precedence; no credits are deducted.
- What happens when a BYOK key is provided for a provider the server doesn't have configured (e.g., Cartesia, which currently has no server adapter)? The server should attempt to use the BYOK key to call the provider anyway, since it's the user's own key and cost.
- What happens when the user has stored BYOK keys from a previous extension version? Keys remain in `browser.storage.local` and are forwarded to the server transparently. No migration needed.
- What happens when the extension cannot reach the server but has locally cached audio? Cached audio plays from IndexedDB without server contact.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST route all premium TTS synthesis requests (OpenAI, ElevenLabs, Groq, Cartesia) through the Proso server. The extension MUST NOT make direct API calls to any third-party TTS provider.
- **FR-002**: The system MUST preserve Browser TTS as a fully client-side, unlimited, server-independent capability (INV-005). No server calls for Browser TTS under any circumstance.
- **FR-003**: The server MUST accept an optional user-provided API key (BYOK) in synthesis requests. When a BYOK key is present, the server MUST use it for that single request and MUST NOT persist it in any storage or logs.
- **FR-004**: When a BYOK key is used for synthesis, the server MUST NOT deduct managed credits. The user's own key covers the provider cost.
- **FR-005**: The server MUST cache BYOK-synthesized audio to avoid redundant provider API calls on repeated content (INV-006).
- **FR-006**: The server MUST provide a dedicated key validation endpoint that accepts a provider name and API key, makes a minimal provider API call to verify the key, and returns a success/failure result with latency information.
- **FR-007**: The key validation endpoint MUST be rate-limited to prevent abuse (key probing, brute-force attempts).
- **FR-008**: The extension MUST forward stored BYOK keys from `browser.storage.local` to the server in the request body when making synthesis requests.
- **FR-009**: The extension's audio generator factory MUST be simplified to two paths: Browser TTS (client-side) and Server TTS (everything else). The four direct provider adapter modules MUST be removed from the extension codebase.
- **FR-010**: The extension's API key test functionality MUST route through the server validation endpoint instead of making direct provider API calls.
- **FR-011**: The extension MUST update its API client interface to support BYOK key forwarding in synthesis requests and a new key validation method.
- **FR-012**: BYOK MUST remain available on all subscription tiers, including the free tier (INV-002). A user with their own API key can synthesize speech regardless of subscription status.
- **FR-013**: The business invariant documentation MUST be updated to reflect the new BYOK mechanism: keys are forwarded to the server for single-request use, not used for direct client-side API calls.
- **FR-014**: Existing managed-credit synthesis flow MUST remain unchanged. When no BYOK key is provided, the server follows the existing flow: credit check, provider routing, synthesis, credit deduction.

### Key Entities

- **Synthesis Request**: A request from the extension to generate audio from text. Contains the text, preferred provider, voice, language, and optionally a BYOK API key. Routed to the server for all premium providers.
- **BYOK API Key**: A user-provided third-party provider API key. Stored locally in the extension for convenience. Transmitted to the server per-request over HTTPS. Never persisted server-side. Overrides managed-credit billing for that request.
- **Key Validation Request**: A request to verify that a BYOK key is valid for a specific provider. Contains provider name and API key. Returns success/failure with response latency.
- **Audio Cache Entry**: Server-side cached audio keyed by text content hash, provider, voice, and language. BYOK-generated audio is cached identically to managed-credit audio to prevent re-synthesis (INV-006).

## Constraints

### Hard Constraints

1. **INV-005 is inviolable**: Browser TTS MUST remain 100% client-side, unlimited, with zero server involvement.
2. **INV-002 is preserved**: BYOK MUST remain available on all tiers. The mechanism changes (server-proxied instead of direct), but the user capability is identical.
3. **INV-006 applies universally**: Cached content never re-charges credits and never re-calls the provider, regardless of whether the original synthesis used managed credits or a BYOK key.
4. **Zero key persistence on server**: BYOK keys MUST NOT be written to any database, log file, disk cache, or persistent storage on the server. Keys exist only in request memory for the duration of the API call.
5. **Existing managed-credit flow unchanged**: This change MUST NOT alter how managed-credit synthesis works for users without BYOK keys.
6. **Hexagonal architecture maintained**: All new server endpoints and extension changes follow the existing ports-and-adapters pattern.
7. **Backwards compatibility**: Users with existing BYOK keys stored in `browser.storage.local` MUST continue to work without any manual migration.

### Soft Constraints

1. Prefer minimal changes to the extension's settings UI. API key input fields stay; they just route differently under the hood.
2. Try to preserve the `settings.testApiKey` message signature if possible, changing only the handler implementation.
3. Keep shared types additive to avoid breaking existing consumers.

## Assumptions

- The server is already deployed and accessible to extension users over HTTPS.
- The server's existing TTS provider adapters (OpenAI, ElevenLabs, Groq) can be instantiated with a runtime-provided API key without requiring DI container changes (confirmed: adapters fetch keys at call time, not construction time).
- Cartesia is not yet implemented on the server. BYOK Cartesia requests will require either adding a Cartesia server adapter or returning a clear "provider not available" error.
- The Anthropic API key testing (for AI summarization) is unrelated to TTS centralization and remains unchanged.
- The extension will retain API key storage fields in `browser.storage.local` for user convenience (so users don't re-enter keys). Keys are read from local storage and forwarded to the server.
- Rate limiting on the key validation endpoint is per-IP, not per-user, since unauthenticated requests may not have a license key.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All premium TTS playback requests (OpenAI, ElevenLabs, Groq, Cartesia) route through the server. Zero direct third-party API calls originate from the extension.
- **SC-002**: BYOK users can synthesize speech with the same perceived quality and responsiveness as before. Server-proxied BYOK adds no more than 200ms latency compared to the previous direct-call path.
- **SC-003**: BYOK synthesis does not deduct managed credits. Users with their own keys see zero credit usage for BYOK-proxied requests.
- **SC-004**: Browser TTS continues to work offline with zero server calls, verifiable by network traffic inspection during playback.
- **SC-005**: BYOK keys are not found in any server logs, database records, or persistent storage after synthesis requests complete.
- **SC-006**: The extension's production build contains no direct TTS provider adapter code (OpenAI, ElevenLabs, Groq, Cartesia adapter files are removed).
- **SC-007**: All existing automated tests pass (adjusted for removed adapter tests), and new tests are added for BYOK forwarding and key validation. Total test count remains at or above the current baseline.
- **SC-008**: Key validation endpoint correctly identifies valid and invalid keys for all supported providers, with results returned in under 5 seconds.
- **SC-009**: Key validation endpoint enforces rate limiting, rejecting excessive requests with appropriate error responses.
- **SC-010**: Users with existing BYOK keys stored in the extension experience zero disruption. Their keys work seamlessly through the new server-proxied path without any manual reconfiguration.
