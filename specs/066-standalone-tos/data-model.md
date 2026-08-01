# Data Model: Standalone Terms of Service

**Feature**: 066-standalone-tos
**Date**: 2026-02-16

## Overview

This feature creates static HTML/CSS legal documents with no dynamic data storage. The "data model" describes the document structure, section inventory, and cross-reference relationships.

## Entity: Terms Document

A standalone HTML page containing 20 legal sections with metadata.

### Attributes

| Attribute | Type | Description |
| --- | --- | --- |
| effectiveDate | date | When these terms take effect |
| lastUpdated | date | When last modified |
| version | string | Version identifier (e.g., "1.0") |
| sections | Section[20] | The 20 required legal sections |
| tocEntries | TocEntry[] | Table of contents navigation links |

### Section Structure

Each of the 20 sections follows this structure:

| Attribute | Type | Description |
| --- | --- | --- |
| id | string | Deep-link anchor (e.g., `refund-policy`) |
| number | integer | Section number (1-20) |
| title | string | Section heading text |
| content | HTML | Section body content |
| subsections | Subsection[] | Optional nested subsections (h3) |

## Section Inventory

| # | ID | Title | Key Content |
| --- | --- | --- | --- |
| 1 | `introduction` | Introduction & Acceptance | Product definition, acceptance triggers, age (16+), AGPL-3.0 relationship |
| 2 | `definitions` | Definitions | 10 defined terms: Extension, Service, Account, Subscription, Credits, BYOK, Free Tier, Content, Provider, Paddle |
| 3 | `the-service` | The Service | Service description, INV-001, INV-002, INV-003, INV-005 |
| 4 | `accounts` | Accounts & Registration | INV-001 (no account for free), user responsibilities, termination, data portability |
| 5 | `pricing` | Subscription Plans & Pricing | Pricing table (6 tiers), 30-day change notice, annual price lock |
| 6 | `billing` | Billing & Payment | Paddle MoR attribution, billing cycles, 7-day grace period, cancellation |
| 7 | `credit-policy` | Credit Policy | INV-004 (no mid-cycle expiry), INV-006 (cache), rollover rules, fallback |
| 8 | `refund-policy` | Refund Policy | 7-day annual, prorated monthly, Paddle processing |
| 9 | `byok` | API Keys & BYOK | INV-002, local storage, user responsibilities, liability |
| 10 | `providers` | Third-Party TTS Providers | 6 providers listed, OpenAI disclosure, ElevenLabs/Cartesia commercial restrictions |
| 11 | `acceptable-use` | Acceptable Use | 8 prohibited activities |
| 12 | `intellectual-property` | Intellectual Property | AGPL-3.0 extension, proprietary server, user content ownership, commercial license |
| 13 | `open-source` | Open Source | AGPL-3.0 governs extension, prevails in conflict, server is proprietary |
| 14 | `privacy` | Privacy | Summary pointing to Privacy Policy, data collection/non-collection |
| 15 | `disclaimers` | Disclaimers | AS IS/AS AVAILABLE, no warranties, AI audio artifacts |
| 16 | `liability` | Limitation of Liability | 12-month cap, excluded damages |
| 17 | `indemnification` | Indemnification | User indemnifies VoxPage for violations |
| 18 | `disputes` | Dispute Resolution | Brazilian law, negotiation first, arbitration option, no class waiver |
| 19 | `changes` | Changes to Terms | 30-day notice, notification channels, cancellation right |
| 20 | `contact` | Contact | Support, commercial, legal, security emails |

## Cross-Reference Map

The following documents reference or are referenced by the ToS:

| Document | Direction | Relationship |
| --- | --- | --- |
| `packages/site/terms.html` | References ToS | Points to standalone ToS as authoritative version |
| `TERMS_OF_SERVICE.md` | Replaced by ToS | Redirects to standalone HTML version |
| `packages/site/privacy.html` | Referenced from ToS | ToS Section 14 links to privacy policy |
| `COMMERCIAL.md` | Referenced from ToS | ToS Section 12 and 13 link to commercial licensing |
| `LICENSE` (AGPL-3.0) | Referenced from ToS | ToS Section 13 explains AGPL-3.0 relationship |
| Paddle Buyer Terms | Referenced from ToS | ToS Section 6 links to Paddle's checkout buyer terms |

## Business Invariant Mapping

| Invariant | Description | Sections Referenced |
| --- | --- | --- |
| INV-001 | Free tier never requires account creation | 3, 4 |
| INV-002 | BYOK always available on all tiers | 3, 9 |
| INV-003 | Word-level sync is always free | 3 |
| INV-004 | No credit expiration mid-billing cycle | 7 |
| INV-005 | Browser TTS always unlimited | 3 |
| INV-006 | Cached content never re-charges | 7 |
