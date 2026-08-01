# Data Model: Server-Side TTS Centralization

**Feature**: 069-server-tts-centralization
**Date**: 2026-03-01

## Entities

### TTSSynthesizeRequest (extended)

The shared request type sent from extension to server for TTS synthesis.

| Field           | Type              | Required | Description                                    |
|-----------------|-------------------|----------|------------------------------------------------|
| text            | string            | Yes      | Text to synthesize (max 5000 chars)            |
| provider        | TTSProvider       | No       | Requested TTS provider                         |
| voice           | string            | No       | Provider-specific voice ID                     |
| language        | string            | No       | Language hint (BCP-47 code)                    |
| byokApiKey      | string            | No       | User's own API key for the provider (NEW)      |

**Invariants**:
- When `byokApiKey` is present, server uses it for the single request and does not persist it
- When `byokApiKey` is present, no managed credits are deducted
- When `byokApiKey` is absent, existing managed-credit flow applies

### TTSTestKeyRequest (new)

Request to validate a BYOK API key against a specific provider.

| Field    | Type       | Required | Description                        |
|----------|------------|----------|------------------------------------|
| provider | string     | Yes      | Provider to test against           |
| apiKey   | string     | Yes      | API key to validate                |

### TTSTestKeyResponse (new)

Response from the key validation endpoint.

| Field     | Type    | Required | Description                          |
|-----------|---------|----------|--------------------------------------|
| success   | boolean | Yes      | Whether the key is valid             |
| provider  | string  | Yes      | Provider that was tested             |
| error     | string  | No       | Error message if validation failed   |
| latencyMs | number  | No       | Round-trip time to provider in ms    |

### TTSRequest (server core — extended)

Internal server request passed from controller to core service.

| Field           | Type              | Required | Description                                    |
|-----------------|-------------------|----------|------------------------------------------------|
| userId          | string            | Yes*     | Authenticated user ID (*optional for BYOK)     |
| text            | string            | Yes      | Text to synthesize                             |
| provider        | TTSProvider       | No       | Requested provider                             |
| voice           | string            | No       | Voice ID                                       |
| language        | string            | No       | Language hint                                  |
| tier            | SubscriptionTier  | Yes*     | User's tier (*defaults to Free for BYOK)       |
| byokApiKey      | string            | No       | Forwarded BYOK key (NEW)                       |

### TTSSynthesizeParams (server port — extended)

Parameters passed to individual server-side provider adapters.

| Field           | Type   | Required | Description                                 |
|-----------------|--------|----------|---------------------------------------------|
| text            | string | Yes      | Text to synthesize                          |
| voice           | string | No       | Voice ID                                    |
| language        | string | No       | Language hint                               |
| speed           | number | No       | Playback speed multiplier                   |
| byokApiKey      | string | No       | Override API key for this request (NEW)     |

## Entity Relationships

```
Extension                              Server
─────────                              ──────

Settings UI                            POST /api/v1/tts/test-key
  │ (user enters BYOK key)               │
  │                                       ▼
  ▼                                    TTSTestKeyRequest
browser.storage.local                     │
  │ (stores key locally)                  ▼
  │                                    Provider validation call
  ▼                                       │
ServerTtsAudioAdapter                     ▼
  │ (reads BYOK key, includes         TTSTestKeyResponse
  │  in request body)
  │
  ▼
IApiClient.synthesize()                POST /api/v1/tts/synthesize
  │                                       │
  ▼                                       ▼
TTSSynthesizeRequest                   TTSRequest (with byokApiKey)
  │ (with optional byokApiKey)            │
  │                                       ├─ Cache check (INV-006)
  │                                       ├─ If BYOK: skip credits
  │                                       ├─ If managed: deduct credits
  │                                       ▼
  │                                    TTSSynthesizeParams (with byokApiKey)
  │                                       │
  │                                       ▼
  │                                    Provider adapter.synthesize()
  │                                       │ (uses byokApiKey || config key)
  │                                       ▼
  ◄───────────────────────────────────  Audio blob response
```

## State Transitions

### BYOK Key Lifecycle

```
[User enters key in Settings UI]
         │
         ▼
[Stored in browser.storage.local]  ◄── Persisted locally (unchanged)
         │
         ├── User clicks "Test"
         │        │
         │        ▼
         │   [Sent to server /test-key]  → Key in memory only → [Response] → Key discarded
         │
         ├── User clicks "Play"
         │        │
         │        ▼
         │   [Sent to server /synthesize] → Key in memory only → [Provider call] → Key discarded
         │
         └── User removes key
                  │
                  ▼
           [Deleted from browser.storage.local]
```

**Server key handling**: At no point does the server write the BYOK key to any storage. The key exists only in the request object's memory and is garbage-collected after the request completes.

## Validation Rules

| Entity               | Field        | Rule                                          |
|----------------------|-------------|-----------------------------------------------|
| TTSSynthesizeRequest | text         | Non-empty, max 5000 characters                |
| TTSSynthesizeRequest | provider     | Must be valid TTSProvider enum value           |
| TTSSynthesizeRequest | byokApiKey   | Non-empty string if provided; no max length    |
| TTSTestKeyRequest    | provider     | Must be supported provider name                |
| TTSTestKeyRequest    | apiKey       | Non-empty string                               |
