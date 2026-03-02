# Research: BYOK Legal & Marketing Copy Update

**Feature**: 070-byok-copy-legal-update
**Date**: 2026-03-01
**Status**: Complete

## RQ-1: False Claim Inventory

**Task**: Search all files in `packages/site/` and `packages/legal/` for BYOK key handling claims that contradict the current server-proxied architecture.

**Method**: Full-text grep for patterns: "never leave", "never sent", "never transmitted", "stored exclusively", "keys stay in your browser", "Proso never sees", "does not proxy".

### Critical False Claims Found (9 total)

| # | File | Line | False Claim | Severity |
|---|------|------|-------------|----------|
| 1 | `packages/legal/terms.html` | 137 | "your API keys never leave your browser" | Critical |
| 2 | `packages/legal/terms.html` | 330 | "Proso never transmits your API keys to Proso servers. API key data flows only between your browser and the third-party provider" | Critical |
| 3 | `packages/legal/terms.html` | 488 | "stored locally in your browser and never transmitted to Proso servers" | Critical |
| 4 | `packages/site/terms.html` | 143 | "Your keys are never transmitted to Proso servers" | Critical |
| 5 | `packages/site/pricing.html` | 162 | "Your keys stay in your browser. Proso never sees them." | High |
| 6 | `packages/site/pricing.html` | 188 | "never sent to Proso servers" | High |
| 7 | `packages/site/privacy.html` | 59 | "They are never transmitted to Proso servers or any party other than your selected TTS provider" | Critical |
| 8 | `packages/site/privacy.html` | 65 | "This transmission is direct from your browser to the provider. Proso does not proxy, log, or store this data" | Critical |
| 9 | `packages/site/privacy.html` | 97 | "We hold no personal data about you" (for BYOK users) | Medium |

### Accurate But Incomplete Statements (needs clarification, not false)

| File | Line | Statement | Issue |
|------|------|-----------|-------|
| `packages/site/index.html` | 217 | "API keys stored locally in your browser" | Accurate (keys ARE stored locally) but omits server forwarding during synthesis |
| `packages/site/index.html` | 353 | "Your keys, your usage, your control" | Accurate — no change needed |
| `packages/legal/terms.html` | 324 | "access premium voice synthesis directly" | Misleading — implies no intermediary; needs rewording |

### No False Claims Found

| File | Notes |
|------|-------|
| `packages/site/index.html` | No direct false claims. Line 217 is incomplete but not false. |

**Decision**: All 9 critical/high false claims must be updated. The 2 incomplete statements should be clarified. The landing page (index.html) line 353 needs no change.

---

## RQ-2: Privacy Policy Audit

**Task**: Read `packages/site/privacy.html` in full to identify BYOK key handling claims and LGPD compliance issues.

### Findings

The privacy policy (`packages/site/privacy.html`) contains **3 false or misleading claims** about BYOK key handling:

1. **Line 59** — Claims API keys are "never transmitted to Proso servers or any party other than your selected TTS provider." This is false: keys are now forwarded through the Proso server to the provider.

2. **Line 65** — States "This transmission is direct from your browser to the provider. Proso does not proxy, log, or store this data." The first two sentences are completely false for BYOK after 069. The "does not log or store" part remains true but the framing is wrong.

3. **Line 97** — States "We hold no personal data about you" for BYOK/free users. Under LGPD, ephemeral processing of API keys (even without storage) constitutes data processing. The statement needs nuance: Proso processes keys ephemerally but does not store or retain them.

### Sections Requiring Update

- **"Extension Data (All Users)"** section (lines 56-61): Update BYOK bullet to describe server forwarding
- **"Data Sent to TTS Providers"** section (lines 64-65): Rewrite to distinguish managed vs BYOK data flow
- **"Your Rights"** section (line 97): Add nuance about ephemeral processing for BYOK users

### Sections NOT Requiring Update

- **"Managed Credit Users"** section (lines 69-76): Already accurate — describes server proxying for managed credits
- **"Cookies and Tracking"** section (lines 80-83): No BYOK references
- **"Third-Party TTS Providers"** section (lines 102-109): No false claims

---

## RQ-3: Landing Page BYOK Copy

**Task**: Read `packages/site/index.html` for BYOK messaging.

### Findings

The landing page has 5 BYOK references:

1. **Line 7** (meta description): "bring your own API key" — accurate, no change needed
2. **Line 196**: "Bring your own API key or use managed credits" — accurate, no change needed
3. **Line 217**: "API keys stored locally in your browser" — accurate but incomplete
4. **Line 353**: "Your keys, your usage, your control" — accurate, no change needed
5. **Line 282/383**: BYOK feature mentions in pricing table — accurate, no change needed

**Decision**: Only line 217 needs clarification. Add "forwarded securely for synthesis" context. All other landing page copy is accurate or doesn't make specific storage/transmission claims.

---

## RQ-4: Definition Consistency Check

**Task**: Verify the BYOK definition is consistent across all documents after updates.

### Current BYOK Definitions

| Document | Current Definition |
|----------|-------------------|
| `legal/terms.html` Section 2 | "allows you to connect your own API keys from third-party TTS providers, enabling premium voice synthesis without using managed credits" |
| `legal/terms.html` Section 9 | "lets you connect your own API keys from third-party TTS providers to access premium voice synthesis directly" |
| `site/terms.html` Section 7 | "API keys for third-party TTS providers... stored locally in your browser" |
| `site/pricing.html` callout | "Already have API keys from a TTS provider? Use them with Proso for free" |
| `site/index.html` | "Bring your own API key or use managed credits" |
| `site/privacy.html` | "Bring Your Own Key (BYOK)" — inline reference only |

### Consistency Target

All definitions post-update must describe the same data flow:
1. Keys cached locally in browser for convenience
2. Forwarded securely via HTTPS to Proso server for synthesis
3. Used for single request, then discarded
4. Never persisted, logged, or stored on server

The level of detail varies by document type:
- **Legal terms**: Full technical data flow with numbered steps
- **Privacy policy**: Processing disclosure with legal basis
- **Site terms**: Simplified version consistent with legal terms
- **Pricing/marketing**: One-sentence reassurance (no jargon)
- **Landing page**: Brief mention only where relevant

---

## RQ-5: LGPD Implications

**Task**: Research whether forwarding a user's API key through a server (even ephemerally) triggers LGPD obligations.

### Analysis

**Is an API key "personal data" under LGPD?**

Under LGPD (Lei Geral de Proteção de Dados, Law 13.709/2018), personal data is defined as "information related to an identified or identifiable natural person" (Art. 5, I). An API key is a string that:
- Is issued to a specific account holder (linkable to a person)
- Could potentially be used to identify the account holder via the provider
- Contains no inherent personal information itself

**Conclusion**: An API key is **indirectly personal data** when it can be linked to an identifiable individual. Under the LGPD's broad definition, Proso should treat BYOK API keys as potentially personal data during ephemeral processing.

**Does ephemeral processing require disclosure?**

Yes. Under LGPD Art. 7, any "processing" of personal data requires a legal basis. Processing includes "collection, production, reception, classification, use, access, reproduction, transmission, distribution, processing, archiving, storage, elimination, evaluation..." (Art. 5, X). Even ephemeral reception and use (without storage) constitutes processing.

**Legal basis**: Legitimate interest (Art. 7, IX) or consent (Art. 7, I). Since users explicitly provide their API key and initiate synthesis, this constitutes implied consent combined with legitimate interest (providing the requested service).

**What disclosures are needed?**

1. Privacy policy must disclose that BYOK keys are processed ephemerally on the server
2. Must state the purpose (synthesis request forwarding)
3. Must state the retention period (none — immediately discarded)
4. Must identify the legal basis (consent/legitimate interest)
5. Users must be informed they can delete their locally stored keys at any time

**Decision**: Update privacy policy with LGPD-compliant disclosure of ephemeral BYOK key processing. No separate consent mechanism needed since users explicitly initiate the action by entering their key and pressing play.

---

## RQ-6: Constitution Conflict Assessment

**Task**: Evaluate whether the current project constitution conflicts with the server-proxied BYOK architecture.

### Conflict Found

**Constitution Section II (Privacy by Design)** states:
> "API keys MUST be stored in browser-encrypted storage only"

This was written when BYOK keys never left the browser. Under the new 069 architecture, keys are:
- **Stored** in browser-encrypted storage (browser.storage.local) — compliant
- **Forwarded** to server ephemerally during synthesis — goes beyond "stored... only"

### Assessment

The constitution clause uses "stored" which strictly refers to persistence. Ephemeral forwarding without storage does not violate the letter of the rule. However, the spirit of the clause was that keys should never touch Proso infrastructure.

**Recommendation**: This should be noted in the plan but does NOT block this copy-only feature. A constitutional amendment should be proposed as follow-up work (out of scope for 070). For now, the plan documents this as a known deviation.

---

## Summary

| Research Question | Status | Key Finding |
|-------------------|--------|-------------|
| RQ-1: False Claims | Complete | 9 false claims across 4 files |
| RQ-2: Privacy Policy | Complete | 3 false/misleading statements, 3 sections need update |
| RQ-3: Landing Page | Complete | 1 incomplete statement (line 217), no false claims |
| RQ-4: Definitions | Complete | 6 documents need consistent BYOK definition post-update |
| RQ-5: LGPD | Complete | Ephemeral processing requires disclosure; legitimate interest basis |
| RQ-6: Constitution | Complete | Noted deviation; amendment out of scope for 070 |

**Total changes needed**: ~15-20 individual text edits across 5 HTML files.
