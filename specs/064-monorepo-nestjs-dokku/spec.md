# Feature Specification: VoxPage Monorepo + NestJS Server + Dokku Deployment

**Feature Branch**: `064-monorepo-nestjs-dokku`
**Created**: 2026-02-10
**Status**: Draft
**Input**: User description: "Expand VoxPage from a standalone Firefox extension into a monorepo with a NestJS backend server deployed to Dokku, implementing subscription management, credit-based TTS proxy, and provider routing from the business logic spec."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Extension Continues Working After Monorepo Migration (Priority: P1)

As a VoxPage user, I can continue using the Firefox extension exactly as before after the project is restructured into a monorepo. No features are lost, no behavior changes, and all existing functionality remains intact.

**Why this priority**: This is the foundational prerequisite. If the monorepo migration breaks the extension, nothing else matters. The 2,881+ existing tests must continue to pass, and the extension must build and run identically.

**Independent Test**: Can be fully tested by running the existing test suite from the new monorepo location and building a Firefox extension that behaves identically to the current build.

**Acceptance Scenarios**:

1. **Given** the project has been restructured into a monorepo with `packages/extension`, **When** the test suite is run from the extension package, **Then** all 2,881+ existing tests pass without modification.
2. **Given** the monorepo structure is in place, **When** the extension is built for Firefox, **Then** the build succeeds and produces a working `.xpi` under 1.1 MB.
3. **Given** a user has the extension installed, **When** they update to the monorepo-built version, **Then** all settings, cached audio, and preferences are preserved and the extension behaves identically.

---

### User Story 2 - Server Health & Deployment (Priority: P1)

As the VoxPage operator, I can deploy the backend server to the existing Dokku instance via `git push`, and the server starts, passes health checks, and produces structured logs visible in the existing Grafana/Loki monitoring stack.

**Why this priority**: A running, healthy, observable server is the foundation for all backend features. Without deployment working, no backend functionality can be delivered. This must be validated before building any business logic.

**Independent Test**: Can be tested by deploying a minimal NestJS app to Dokku, verifying the health endpoint responds, and confirming logs appear in Grafana.

**Acceptance Scenarios**:

1. **Given** the server code is pushed to the Dokku remote, **When** Dokku builds and deploys the container, **Then** the health endpoint responds with status "ok", the server version, and uptime.
2. **Given** the server is running on Dokku, **When** requests are made to any endpoint, **Then** structured JSON logs with timestamp, level, request ID, and duration appear in Grafana/Loki within 30 seconds.
3. **Given** the server encounters a fatal error during startup, **When** Dokku attempts deployment, **Then** the deployment rolls back to the previous working version (zero-downtime).

---

### User Story 3 - Free Tier TTS Without Account (Priority: P1)

As a free-tier VoxPage user, I can use text-to-speech with browser TTS and bring-your-own-key (BYOK) providers without creating an account, logging in, or interacting with the server at all. The extension works fully offline for browser TTS.

**Why this priority**: Business invariant INV-001 (free tier never requires account creation) and INV-002 (BYOK always available) are non-negotiable. This ensures the existing user base is never disrupted by the introduction of a backend server.

**Independent Test**: Can be tested by using the extension with no server configured and verifying all current TTS features work without network calls to the VoxPage server.

**Acceptance Scenarios**:

1. **Given** a user has not entered any license key, **When** they use browser TTS, **Then** playback works without any server communication.
2. **Given** a user has entered their own API key for a TTS provider (BYOK), **When** they play text, **Then** the extension calls the provider directly without routing through the VoxPage server.
3. **Given** the VoxPage server is completely unreachable, **When** a free-tier or BYOK user uses the extension, **Then** all functionality works identically to the current version.

---

### User Story 4 - License Validation & Subscription Management (Priority: P2)

As a paying VoxPage user, I can activate a license key in the extension, which validates against the server and unlocks my subscription tier's features and credit allocation. I can view my subscription status and manage it through the extension.

**Why this priority**: Subscription management is the first revenue-generating feature and unlocks the credit system. It builds on the deployed server from Story 2 and is required before the TTS proxy (Story 5).

**Independent Test**: Can be tested by activating a license key in the extension and verifying the server returns the correct subscription tier, credit balance, and feature entitlements.

**Acceptance Scenarios**:

1. **Given** a user has a valid license key, **When** they enter it in the extension settings, **Then** the extension validates it with the server and displays their subscription tier and credit balance.
2. **Given** a user's subscription is active, **When** they open the extension popup, **Then** they see their current tier, remaining credits, and a link to manage their subscription.
3. **Given** a user wants to upgrade their tier, **When** they click the upgrade button, **Then** the extension opens a checkout page (via Paddle) pre-filled with their account details.
4. **Given** a license key is invalid or expired, **When** validation is attempted, **Then** the extension falls back to free-tier behavior with a clear message about the issue.

---

### User Story 5 - Managed Credit TTS Proxy (Priority: P2)

As a subscribed VoxPage user with managed credits, I can use premium TTS providers (OpenAI, ElevenLabs, Groq) without entering my own API keys. The server handles provider routing, credit deduction, and audio generation, returning audio to the extension for playback through the existing pipeline.

**Why this priority**: This is the core value proposition for paying users -- premium TTS without the complexity of managing API keys. It depends on subscription management (Story 4) being in place.

**Independent Test**: Can be tested by making a TTS request through the server proxy endpoint, verifying credits are deducted, the correct provider is used, and playable audio is returned.

**Acceptance Scenarios**:

1. **Given** a user has sufficient credits and selects a managed provider, **When** they click play on a paragraph, **Then** the extension sends the text to the server, which generates audio via the selected provider, deducts credits, and returns the audio for playback.
2. **Given** a user's paragraph was previously synthesized and cached on the server, **When** they request the same content again, **Then** the cached audio is returned without deducting additional credits (INV-006).
3. **Given** a user has insufficient credits for a request, **When** they attempt TTS, **Then** the extension displays a clear message about insufficient credits and offers options to purchase more or switch to BYOK.
4. **Given** the selected provider is temporarily unavailable, **When** a TTS request is made, **Then** the server falls back to the next provider in the routing chain and returns audio with a notice about the fallback.

---

### User Story 6 - Billing Webhook Processing (Priority: P2)

As the VoxPage operator, when a customer completes a purchase, upgrades, downgrades, cancels, or renews through Paddle, the server automatically updates their subscription status, credit allocation, and feature access in real-time.

**Why this priority**: Without automated billing event processing, subscription management would require manual intervention. This closes the loop between payment and service delivery.

**Independent Test**: Can be tested by sending Paddle webhook payloads to the server and verifying subscription state transitions, credit allocations, and feature gate changes.

**Acceptance Scenarios**:

1. **Given** a customer completes a new subscription purchase via Paddle, **When** the webhook arrives, **Then** the server creates their subscription record, allocates tier-appropriate credits, and enables corresponding features.
2. **Given** a customer cancels their subscription, **When** the cancellation webhook arrives, **Then** the server marks the subscription for end-of-period expiry (credits remain usable until the billing period ends, per INV-004).
3. **Given** a billing period renews, **When** the renewal webhook arrives, **Then** the server allocates fresh credits for the new period and resets usage counters.
4. **Given** a webhook arrives with an invalid signature, **When** the server processes it, **Then** it rejects the request and logs a security event.

---

### User Story 7 - Credit Balance Visibility & History (Priority: P3)

As a subscribed VoxPage user, I can see my current credit balance, usage history, and estimated costs in the extension, so I can manage my TTS usage and make informed decisions about my subscription tier.

**Why this priority**: Transparency about credit usage builds trust and reduces support inquiries. It's a quality-of-life feature that enhances the subscription experience but isn't required for core functionality.

**Independent Test**: Can be tested by querying the credit balance and history endpoints and verifying the extension displays accurate, up-to-date information.

**Acceptance Scenarios**:

1. **Given** a subscribed user, **When** they view the extension popup, **Then** they see their remaining credits as a percentage and absolute number.
2. **Given** a user has made several TTS requests, **When** they view their credit history, **Then** they see a chronological list of transactions with provider, character count, credit cost, and timestamp.
3. **Given** a user is approaching their credit limit (below 10% remaining), **When** they open the extension, **Then** they see a warning with options to manage their usage or upgrade.

---

### User Story 8 - Shared Domain Types Across Extension & Server (Priority: P3)

As a VoxPage developer, I can import shared domain types, business constants, and the Result type from a common package (`@voxpage/shared`) used by both the extension and server, ensuring type-safe consistency across the entire system.

**Why this priority**: Shared types prevent drift between extension and server, reducing integration bugs. This is a developer-experience improvement that pays dividends over time but isn't user-facing.

**Independent Test**: Can be tested by importing shared types in both extension and server code, verifying compilation succeeds, and running type-compatibility tests.

**Acceptance Scenarios**:

1. **Given** the shared package defines subscription tier types, **When** the extension receives a subscription response from the server, **Then** the response is validated against the same type definition used by the server.
2. **Given** a developer adds a new credit transaction type to the shared package, **When** they build both extension and server, **Then** any type mismatches are caught at compile time.
3. **Given** the shared package defines business constants (tier credits, provider costs), **When** these values are used in both extension and server, **Then** they reference the exact same source of truth.

---

### Edge Cases

- What happens when the server is deployed but no database services are available on Dokku? The server should start in a degraded mode with in-memory storage and clear error logging.
- What happens when a user's subscription lapses while they have cached audio? Cached audio remains playable (client-side), but new managed TTS requests are denied.
- What happens when Paddle sends duplicate webhook events? The server must be idempotent -- processing the same event twice produces the same result without double-counting credits.
- What happens when the extension is updated but the server API version is older? The extension must handle version mismatches gracefully, falling back to BYOK mode if the server API is incompatible.
- What happens when a TTS provider's pricing changes? Provider cost constants in the shared package are updated, and the server uses the new costs for future requests without retroactively adjusting past transactions.
- What happens during monorepo migration if `git mv` fails for certain files? The migration script should fall back to copy + delete, and all changes should be validated by the test suite before committing.

## Requirements *(mandatory)*

### Functional Requirements

#### Monorepo Structure

- **FR-001**: The project MUST be organized as a monorepo with three packages: `packages/extension` (Firefox extension), `packages/server` (NestJS backend), and `packages/shared` (shared domain types and constants).
- **FR-002**: The extension package MUST retain all existing functionality, tests, and build behavior unchanged after migration to the monorepo structure.
- **FR-003**: The shared package MUST export domain types (subscription tiers, credit allocations, provider identifiers), business constants (tier credit amounts, provider costs), and the Result error-handling type.
- **FR-004**: All packages MUST share a single linting configuration and enforce TypeScript strict mode.

#### Server Core

- **FR-005**: The server MUST expose a health endpoint that returns operational status, version, and uptime for deployment orchestration health checks.
- **FR-006**: The server's domain layer (business logic) MUST have zero framework dependencies -- it MUST be pure TypeScript with no NestJS imports.
- **FR-007**: The server MUST use the same hexagonal architecture pattern as the extension: port interfaces for contracts, adapter implementations, and a composition root for dependency injection.
- **FR-008**: All fallible server operations MUST return the shared Result type instead of throwing exceptions.

#### License & Subscription

- **FR-009**: The server MUST validate license keys and return the associated subscription tier, feature entitlements, and credit balance.
- **FR-010**: The server MUST support the complete subscription lifecycle: activation, renewal, upgrade, downgrade, cancellation, and expiry.
- **FR-011**: Unknown or missing license keys MUST be treated as free-tier users with default entitlements (INV-001).

#### Credits & Usage

- **FR-012**: The server MUST track credit balances per user and deduct credits atomically when processing TTS requests.
- **FR-013**: Credits MUST NOT expire before the end of the current billing period (INV-004).
- **FR-014**: Previously cached content MUST NOT incur additional credit charges when re-requested (INV-006).
- **FR-015**: The server MUST provide credit balance and transaction history endpoints.

#### TTS Proxy

- **FR-016**: The server MUST proxy TTS requests to upstream providers (OpenAI, ElevenLabs, Groq), handling authentication, rate limiting, and error recovery.
- **FR-017**: The server MUST route TTS requests to the optimal provider based on the user's tier, language requirements, provider availability, and cost efficiency.
- **FR-018**: When a provider is unavailable, the server MUST fall back to the next provider in the routing chain.
- **FR-019**: Browser TTS MUST remain unlimited and entirely client-side with no server involvement (INV-005).

#### Billing Integration

- **FR-020**: The server MUST accept and verify Paddle webhook events for subscription lifecycle management.
- **FR-021**: Webhook processing MUST be idempotent -- duplicate events produce identical results.
- **FR-022**: The server MUST generate checkout URLs for new subscriptions and tier upgrades.

#### Extension Integration

- **FR-023**: The extension MUST validate license keys against the server on startup when a key is configured.
- **FR-024**: The extension MUST route managed-credit TTS requests through the server proxy while continuing to route BYOK requests directly to providers (INV-002).
- **FR-025**: The extension MUST display credit balance, subscription tier, and usage information from the server.
- **FR-026**: The extension MUST function fully without the server for free-tier and BYOK users.

#### Deployment & Operations

- **FR-027**: The server MUST deploy to the existing Dokku instance via `git push` with zero-downtime deployments.
- **FR-028**: The server MUST produce structured JSON logs compatible with the existing Loki/Grafana monitoring stack.
- **FR-029**: The server MUST integrate with Dokku-provisioned database and cache services discovered during infrastructure reconnaissance.

#### Infrastructure Discovery

- **FR-030**: Before implementation begins, the existing Dokku infrastructure MUST be fully explored: installed plugins, existing apps, database availability, logging pipeline, secret management patterns, SSL/TLS setup, and deployment strategies.
- **FR-031**: The server architecture MUST adapt to discovered infrastructure capabilities (e.g., use available database plugins, follow established secret management patterns).

### Key Entities

- **User**: Represents a VoxPage user; identified by license key, associated with a subscription and credit balance.
- **Subscription**: A user's paid plan; includes tier (free, pro, enterprise), status (active, cancelled, expired, past_due), billing period dates, and feature entitlements.
- **CreditAllocation**: Credits allocated to a user for a billing period; includes total amount, remaining balance, and period boundaries.
- **CreditTransaction**: An individual credit deduction or allocation event; includes amount, provider, character count, timestamp, and reference to the TTS request.
- **TTSRequest**: A request to synthesize text; includes text content, target provider, language, voice, and cache key.
- **RoutingDecision**: The result of provider selection logic; includes selected provider, fallback chain, cost estimate, and routing rationale.
- **LicenseKey**: A validated key that maps to a user and subscription; includes activation status, device count, and expiry.

## Assumptions

- The existing Dokku instance at `ProxMox.Dokku` is accessible via SSH and has sufficient resources to run the server.
- Paddle is the billing provider (based on the business logic spec reference).
- The extension's existing AGPL-3.0 license applies to the server code.
- Provider costs and tier credit allocations are defined in the business logic spec and will be encoded in the shared package.
- Port 5000 is the Dokku default and will be used for the server.
- The existing pnpm package manager supports workspace-based monorepo configuration.
- NestJS 10+ is the server framework, chosen for its dependency injection system that aligns with the hexagonal architecture pattern.
- The ORM choice (TypeORM vs Prisma) will be determined by Dokku infrastructure discovery in Phase 0.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 2,881+ existing extension tests pass after monorepo migration without any test modifications.
- **SC-002**: The extension builds from the new monorepo location and produces a working Firefox extension under 1.1 MB.
- **SC-003**: The server responds to health check requests within 200 milliseconds after deployment to Dokku.
- **SC-004**: Server deployment via `git push` completes with zero downtime (health check passes within 60 seconds of push).
- **SC-005**: Structured server logs appear in Grafana/Loki within 30 seconds of request processing.
- **SC-006**: The server's domain layer contains zero framework-specific imports (pure hexagonal separation verified by static analysis).
- **SC-007**: The server unit test suite includes 200+ tests covering domain logic, with all tests passing.
- **SC-008**: License validation round-trip (extension sends key, server validates, extension receives response) completes within 500 milliseconds.
- **SC-009**: TTS proxy round-trip (request to audio delivery) adds no more than 300 milliseconds of overhead compared to direct provider calls.
- **SC-010**: Webhook processing handles 100 events per minute without degradation.
- **SC-011**: Credit deduction is atomic -- no credits are lost or double-counted under concurrent request conditions.
- **SC-012**: Free-tier and BYOK users experience zero behavioral changes after the server is introduced.
- **SC-013**: The shared package compiles successfully and is importable by both extension and server with no type errors.
