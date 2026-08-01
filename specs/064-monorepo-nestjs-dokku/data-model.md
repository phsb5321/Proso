# Data Model: VoxPage Monorepo + NestJS Server

**Branch**: `064-monorepo-nestjs-dokku` | **Date**: 2026-02-10

## Entity Relationship Overview

```
User 1──1 LicenseKey
User 1──* Subscription (only 1 active at a time)
Subscription 1──* CreditAllocation (1 per billing period)
CreditAllocation 1──* CreditTransaction
User 1──* TTSRequest
TTSRequest 1──1 RoutingDecision
TTSRequest 0──1 CreditTransaction (cached requests have no transaction)
```

## Entities

### User

Represents a VoxPage user identified by their license key.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Internal user identifier |
| licenseKey | string | UNIQUE, indexed | License key hash (not stored in plaintext) |
| email | string? | nullable | Optional email for account recovery |
| createdAt | DateTime | auto | Account creation timestamp |
| updatedAt | DateTime | auto | Last update timestamp |

**Invariant**: Users with unknown/missing license keys are treated as free-tier (INV-001). No account creation required for free-tier access.

### Subscription

A user's paid plan with tier, status, and billing period.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Internal subscription identifier |
| userId | UUID | FK → User, indexed | Owning user |
| paddleSubscriptionId | string | UNIQUE, indexed | Paddle's subscription identifier |
| tier | SubscriptionTier | enum | free, pro, enterprise |
| status | SubscriptionStatus | enum | active, cancelled, expired, past_due, trialing |
| currentPeriodStart | DateTime | required | Current billing period start |
| currentPeriodEnd | DateTime | required | Current billing period end |
| cancelledAt | DateTime? | nullable | When cancellation was requested |
| createdAt | DateTime | auto | Subscription creation timestamp |
| updatedAt | DateTime | auto | Last update timestamp |

**Invariant**: Cancelled subscriptions remain active until `currentPeriodEnd` (INV-004).

### CreditAllocation

Credits allocated to a user for a billing period. One allocation per period.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Internal allocation identifier |
| userId | UUID | FK → User, indexed | Owning user |
| subscriptionId | UUID | FK → Subscription | Associated subscription |
| totalCredits | integer | >= 0 | Total credits for this period |
| remainingCredits | integer | >= 0 | Credits remaining |
| periodStart | DateTime | required | Period start (matches subscription) |
| periodEnd | DateTime | required | Period end (matches subscription) |
| createdAt | DateTime | auto | Allocation timestamp |

**Invariant**: Credits do not expire before `periodEnd` (INV-004). `remainingCredits` cannot go negative (atomic deduction).

### CreditTransaction

An individual credit deduction or allocation event.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Transaction identifier |
| allocationId | UUID | FK → CreditAllocation | Parent allocation |
| userId | UUID | FK → User, indexed | Owning user |
| type | TransactionType | enum | deduction, allocation, refund |
| amount | integer | > 0 | Credit amount (always positive) |
| provider | TTSProvider? | nullable | Provider used (for deductions) |
| characterCount | integer? | nullable | Characters synthesized |
| cacheKey | string? | nullable | Cache key reference |
| ttsRequestId | UUID? | FK → TTSRequest | Associated TTS request |
| createdAt | DateTime | auto | Transaction timestamp |

**Invariant**: Cached content never creates a deduction transaction (INV-006).

### TTSRequest

A request to synthesize text via the server proxy.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Request identifier |
| userId | UUID | FK → User, indexed | Requesting user |
| textHash | string | indexed | SHA-256 hash of text content |
| text | string | required | Text to synthesize |
| provider | TTSProvider | required | Selected/routed provider |
| voice | string? | nullable | Voice identifier |
| language | string? | nullable | BCP-47 language code |
| cacheKey | string | indexed | Cache lookup key |
| cachedHit | boolean | default: false | Whether cache was used |
| characterCount | integer | required | Character count for billing |
| durationMs | integer? | nullable | Audio duration |
| createdAt | DateTime | auto | Request timestamp |

### RoutingDecision

The result of provider selection logic for a TTS request.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Decision identifier |
| ttsRequestId | UUID | FK → TTSRequest, UNIQUE | Associated request |
| selectedProvider | TTSProvider | required | Provider ultimately used |
| fallbackChain | TTSProvider[] | required | Ordered fallback list |
| costEstimate | integer | required | Estimated credit cost |
| routingRationale | string | required | Why this provider was chosen |
| fallbackUsed | boolean | default: false | Whether fallback was triggered |
| createdAt | DateTime | auto | Decision timestamp |

### LicenseKey

A validated key that maps to a user and subscription.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Key identifier |
| userId | UUID | FK → User | Owning user |
| keyHash | string | UNIQUE, indexed | SHA-256 hash of the key |
| activatedAt | DateTime | required | Activation timestamp |
| expiresAt | DateTime? | nullable | Expiration (null = never) |
| deviceCount | integer | default: 0 | Number of activated devices |
| maxDevices | integer | default: 5 | Maximum allowed devices |
| isActive | boolean | default: true | Whether the key is active |
| createdAt | DateTime | auto | Creation timestamp |

## Enums

### SubscriptionTier
- `free` — No account required, browser TTS + BYOK only
- `pro` — Managed credits, premium providers, priority support
- `enterprise` — Higher credit allocation, dedicated support, custom routing

### SubscriptionStatus
- `active` — Subscription is current and paid
- `cancelled` — User cancelled, remains active until period end
- `expired` — Billing period ended without renewal
- `past_due` — Payment failed, grace period active
- `trialing` — Free trial period

### TTSProvider
- `openai` — OpenAI TTS API
- `elevenlabs` — ElevenLabs TTS API
- `groq` — Groq TTS API
- `browser` — Client-side browser TTS (never routed through server)

### TransactionType
- `deduction` — Credits spent on TTS request
- `allocation` — Credits granted for billing period
- `refund` — Credits returned (e.g., failed request)

## Prisma Schema (Reference)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum SubscriptionTier {
  free
  pro
  enterprise
}

enum SubscriptionStatus {
  active
  cancelled
  expired
  past_due
  trialing
}

enum TTSProvider {
  openai
  elevenlabs
  groq
}

enum TransactionType {
  deduction
  allocation
  refund
}

model User {
  id           String         @id @default(uuid())
  licenseKey   String         @unique
  email        String?
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt

  subscriptions    Subscription[]
  creditAllocations CreditAllocation[]
  creditTransactions CreditTransaction[]
  ttsRequests      TTSRequest[]
  licenseKeys      LicenseKey[]
}

model Subscription {
  id                   String             @id @default(uuid())
  userId               String
  paddleSubscriptionId String             @unique
  tier                 SubscriptionTier
  status               SubscriptionStatus
  currentPeriodStart   DateTime
  currentPeriodEnd     DateTime
  cancelledAt          DateTime?
  createdAt            DateTime           @default(now())
  updatedAt            DateTime           @updatedAt

  user              User               @relation(fields: [userId], references: [id])
  creditAllocations CreditAllocation[]

  @@index([userId])
}

model CreditAllocation {
  id               String   @id @default(uuid())
  userId           String
  subscriptionId   String
  totalCredits     Int
  remainingCredits Int
  periodStart      DateTime
  periodEnd        DateTime
  createdAt        DateTime @default(now())

  user         User           @relation(fields: [userId], references: [id])
  subscription Subscription   @relation(fields: [subscriptionId], references: [id])
  transactions CreditTransaction[]

  @@index([userId])
  @@index([subscriptionId])
}

model CreditTransaction {
  id             String          @id @default(uuid())
  allocationId   String
  userId         String
  type           TransactionType
  amount         Int
  provider       TTSProvider?
  characterCount Int?
  cacheKey       String?
  ttsRequestId   String?
  createdAt      DateTime        @default(now())

  allocation CreditAllocation @relation(fields: [allocationId], references: [id])
  user       User             @relation(fields: [userId], references: [id])
  ttsRequest TTSRequest?      @relation(fields: [ttsRequestId], references: [id])

  @@index([userId])
  @@index([allocationId])
}

model TTSRequest {
  id             String      @id @default(uuid())
  userId         String
  textHash       String
  text           String
  provider       TTSProvider
  voice          String?
  language       String?
  cacheKey       String
  cachedHit      Boolean     @default(false)
  characterCount Int
  durationMs     Int?
  createdAt      DateTime    @default(now())

  user            User              @relation(fields: [userId], references: [id])
  routingDecision RoutingDecision?
  transactions    CreditTransaction[]

  @@index([userId])
  @@index([cacheKey])
  @@index([textHash])
}

model RoutingDecision {
  id               String      @id @default(uuid())
  ttsRequestId     String      @unique
  selectedProvider TTSProvider
  fallbackChain    TTSProvider[]
  costEstimate     Int
  routingRationale String
  fallbackUsed     Boolean     @default(false)
  createdAt        DateTime    @default(now())

  ttsRequest TTSRequest @relation(fields: [ttsRequestId], references: [id])
}

model LicenseKey {
  id          String   @id @default(uuid())
  userId      String
  keyHash     String   @unique
  activatedAt DateTime
  expiresAt   DateTime?
  deviceCount Int      @default(0)
  maxDevices  Int      @default(5)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
}
```

## Business Invariant Enforcement

| Invariant | Database Enforcement | Application Enforcement |
|-----------|---------------------|------------------------|
| INV-001: Free tier no account | No User row required for free access | License validation returns default free tier for unknown keys |
| INV-002: BYOK always available | N/A (client-side only) | Extension routes BYOK directly, never through server |
| INV-003: Word sync free | N/A (client-side only) | No server involvement |
| INV-004: No mid-cycle credit expiry | `periodEnd` on CreditAllocation | CreditService checks `periodEnd` before marking expired |
| INV-005: Browser TTS unlimited | N/A (client-side only) | No server involvement |
| INV-006: Cached content no re-charge | `cachedHit` on TTSRequest, nullable `ttsRequestId` on transaction | Cache lookup before credit deduction; cached hits skip transactions |
