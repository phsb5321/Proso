# Feature Specification: BYOK Legal & Marketing Copy Update

**Feature Branch**: `070-byok-copy-legal-update`
**Created**: 2026-03-01
**Status**: Draft
**Input**: Update all legal documents, marketing pages, and privacy policy to accurately reflect the new BYOK key handling architecture after 069-server-tts-centralization.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Accurate Terms of Service (Priority: P1)

A user or legal reviewer reads the Proso Terms of Service and finds accurate, up-to-date information about how BYOK API keys are handled. The Terms clearly explain that keys are forwarded through the Proso server for synthesis, held only in memory for a single request, and never persisted. No statement contradicts the current architecture.

**Why this priority**: Legal documents contain binding commitments. False claims about key handling (e.g., "keys never leave your browser") create legal liability and erode user trust. This is the highest priority because it has regulatory implications under Brazilian data protection law (LGPD).

**Independent Test**: Read every sentence in the Terms of Service that mentions BYOK, API keys, or key storage. Verify each statement is factually correct against the current system architecture: keys are cached locally in the browser, forwarded over HTTPS to the server for synthesis, used once, and discarded.

**Acceptance Scenarios**:

1. **Given** the Terms of Service document, **When** a reviewer searches for "never leave" or "never transmitted" in the context of API keys, **Then** zero results are found.
2. **Given** the Terms of Service Section 9 (API Keys & BYOK), **When** a user reads the key handling description, **Then** it accurately describes: local caching, HTTPS forwarding, single-request usage, and immediate discard.
3. **Given** the Terms of Service Section 3 (The Service), **When** a user reads the BYOK bullet point, **Then** it mentions that keys are forwarded through the server and never stored.
4. **Given** the Terms of Service Section 14 (Privacy), **When** a user reads the BYOK data bullet, **Then** it accurately states that keys are forwarded during synthesis and are not permanently stored.
5. **Given** the BYOK definition in Section 2, **When** a user reads the definition, **Then** it accurately reflects the server-proxied model.

---

### User Story 2 - Accurate Marketing & Pricing Copy (Priority: P2)

A potential customer reads the pricing page and FAQ to understand how BYOK works. The copy accurately explains that BYOK keys are forwarded securely through the server, never stored, and available on all tiers for free. The messaging is reassuring and transparent without being alarmist.

**Why this priority**: Marketing copy shapes purchasing decisions and user expectations. False claims ("Proso never sees them") undermine trust if users later discover keys transit through the server. Accurate, positive framing maintains conversion while being honest.

**Independent Test**: Read every BYOK-related section on the pricing page, landing page, and FAQ. Verify no statement claims keys "stay in your browser" or are "never sent to Proso servers." Verify each statement accurately describes the secure forwarding model.

**Acceptance Scenarios**:

1. **Given** the pricing page BYOK callout box, **When** a user reads it, **Then** it states keys are forwarded securely and never stored, rather than claiming keys "stay in your browser."
2. **Given** the FAQ answer to "Can I use my own API keys?", **When** a user reads the answer, **Then** it explains local caching plus secure server forwarding and immediate discard.
3. **Given** the landing page BYOK section (if present), **When** a user reads it, **Then** no false claims about keys remaining browser-only are present.
4. **Given** all marketing pages, **When** a reviewer searches for "Proso never sees" or "keys stay in your browser", **Then** zero results are found.

---

### User Story 3 - Accurate Privacy Policy (Priority: P2)

A user concerned about data privacy reads the privacy policy and finds accurate disclosure about BYOK key handling. The policy explains that keys are processed ephemerally during synthesis requests, never persisted, and the legal basis for this processing.

**Why this priority**: Privacy policies have legal force and are subject to regulatory scrutiny under LGPD. Accurate disclosure of ephemeral key processing protects both users and Proso from compliance risks.

**Independent Test**: Read the privacy policy in full. Verify any BYOK key handling section accurately describes ephemeral server-side processing. Verify no statement claims keys never touch Proso servers.

**Acceptance Scenarios**:

1. **Given** the privacy policy document, **When** a user reads it, **Then** it discloses that BYOK keys are transmitted to the server during synthesis.
2. **Given** the privacy policy, **When** a user searches for "never leave" or "never transmitted" in the context of API keys, **Then** zero results are found.
3. **Given** the privacy policy, **When** a user reads the data processing section, **Then** it explains that keys are held in server memory only for the duration of one request and never written to persistent storage.

---

### User Story 4 - Simplified Site Terms Accuracy (Priority: P3)

A user reading the simplified terms on the website finds consistent, accurate BYOK messaging that matches the full Terms of Service.

**Why this priority**: The site terms are a simplified version of the full legal terms. Inconsistencies between the two documents create confusion and legal ambiguity.

**Independent Test**: Compare every BYOK-related statement in the site terms against the full Terms of Service. Verify consistency and accuracy.

**Acceptance Scenarios**:

1. **Given** the site terms, **When** a reviewer reads the API Keys section, **Then** it accurately describes BYOK key forwarding through the server.
2. **Given** both the site terms and the full Terms of Service, **When** a reviewer compares BYOK descriptions, **Then** they are consistent and non-contradictory.

---

### User Story 5 - Cross-Document Consistency Verification (Priority: P3)

All documents across the Proso website and legal pages use consistent language and facts when describing BYOK. A reviewer can verify this by running a text search across all files.

**Why this priority**: Inconsistent messaging across documents erodes trust and creates legal ambiguity. This is a verification story that ensures all other stories were implemented correctly.

**Independent Test**: Run a full-text search across all HTML files for known false-claim patterns. Verify zero matches.

**Acceptance Scenarios**:

1. **Given** all HTML files in the site and legal directories, **When** searching for "never leave your browser" or "never transmitted to Proso servers" or "keys stay in your browser" or "Proso never sees", **Then** zero matches are found.
2. **Given** the BYOK definition across all documents, **When** comparing definitions, **Then** all documents describe the same data flow: local caching, server forwarding, single-use, immediate discard.

---

### Edge Cases

- What if a document has no BYOK references at all? Skip it — only update documents that contain BYOK or API key claims.
- What if the privacy policy does not exist yet? Document the absence for a future feature; do not create a full privacy policy in this scope.
- What if the landing page has no BYOK messaging? Verify this is the case and document it — no false claims means no updates needed.
- What if a document uses indirect phrasing (e.g., "your data stays local") that could be interpreted as a BYOK key claim? Update it for clarity if it could reasonably be read as referring to API keys.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All documents MUST NOT contain any statement claiming BYOK API keys "never leave the browser," "are never transmitted to Proso servers," or similar language that contradicts the server-proxied architecture.
- **FR-002**: The Terms of Service Section 9 (API Keys & BYOK) MUST accurately describe the complete BYOK key data flow: local caching, HTTPS transmission to server, single-request usage, and immediate discard from server memory.
- **FR-003**: The Terms of Service Section 3 (The Service) MUST describe BYOK as using keys forwarded securely through the Proso server, not as keys that "never leave your browser."
- **FR-004**: The Terms of Service Section 14 (Privacy) MUST accurately state that BYOK keys are forwarded to the server during synthesis and are not permanently stored.
- **FR-005**: The Terms of Service Section 2 (Definitions) MUST define BYOK in a way that is consistent with the server-proxied model.
- **FR-006**: The site terms Section 7 MUST accurately describe BYOK key handling consistent with the full Terms of Service.
- **FR-007**: The pricing page BYOK callout MUST replace "keys stay in your browser" with accurate messaging about secure server forwarding.
- **FR-008**: The pricing page FAQ about BYOK MUST replace "never sent to Proso servers" with accurate messaging about ephemeral server forwarding.
- **FR-009**: The landing page MUST NOT contain any false claims about BYOK key handling. If BYOK is mentioned, it must be accurate.
- **FR-010**: The privacy policy (if it exists) MUST disclose that BYOK keys are ephemerally processed on the server during synthesis requests.
- **FR-011**: All documents MUST continue to clearly state that BYOK is available on all tiers, including Free, at no additional cost.
- **FR-012**: All documents MUST continue to clearly state that Browser TTS is 100% client-side, unlimited, and involves no server communication.
- **FR-013**: Updated copy MUST be consistent across all documents — the same facts described the same way.
- **FR-014**: The tone of updated copy MUST be transparent and confidence-building, framing the change as improving security and reliability.
- **FR-015**: A post-update verification search MUST confirm zero remaining false claims across all site and legal files.

### Key Entities

- **BYOK API Key**: A third-party TTS provider API key owned by the user. Cached in browser local storage for convenience. Forwarded to the Proso server over HTTPS during synthesis requests. Used for one provider API call, then discarded from server memory. Never persisted, logged, or stored on the server.
- **Managed Credits**: Proso's subscription-based model where Proso uses its own API keys on behalf of users. Credits are deducted per request.
- **Browser TTS**: Built-in browser speech synthesis. Entirely client-side, unlimited, free. No server involvement whatsoever.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero instances of false BYOK key claims remain across all files — verified by automated text search for known false patterns ("never leave your browser," "never transmitted to Proso servers," "keys stay in your browser," "Proso never sees").
- **SC-002**: 100% of documents containing BYOK references describe the same data flow: local caching, HTTPS forwarding, single-request usage, immediate discard.
- **SC-003**: The Terms of Service Section 9 contains a complete, accurate BYOK key handling description including data flow steps.
- **SC-004**: All updated documents preserve existing BYOK guarantees: available on all tiers, free, no additional cost.
- **SC-005**: All updated documents preserve Browser TTS guarantees: client-side only, unlimited, no server involvement.
- **SC-006**: A non-technical reviewer can read any updated BYOK section and correctly understand that keys are forwarded through the server but never stored — within 30 seconds of reading.

## Assumptions

- The 069-server-tts-centralization feature is fully implemented and the architecture description is accurate.
- The only files requiring updates are within the site and legal directories. No extension or server source code changes are needed.
- Brazilian law (LGPD) applies since Proso is based in Recife, Brazil. Under LGPD, an API key may constitute personal data if it can be linked to an identifiable individual; ephemeral processing still requires disclosure.
- The existing HTML structure and CSS classes in all documents should be preserved where possible — only text content changes.
- If the privacy policy does not exist, the absence should be documented but a full privacy policy is out of scope.

## Scope Boundaries

### In Scope
- All HTML files in the site and legal directories that contain BYOK, API key, or key handling claims
- Text content updates only (no structural or design changes)
- Post-update consistency verification via text search

### Out of Scope
- Extension source code changes (completed in 069)
- Server source code changes (completed in 069)
- Creation of new legal documents (e.g., a full privacy policy if none exists)
- Translation of documents to other languages
- Changes to the extension's settings UI or key input experience
- Full LGPD compliance audit beyond BYOK key handling disclosure

## Dependencies

- **069-server-tts-centralization**: Must be complete before this feature begins (confirmed complete).
