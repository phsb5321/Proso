# VoxPage Telemetry Event Catalog

Complete reference of all tracked telemetry events.

## Event Naming Convention

Events follow the pattern: `category.action_detail`

- **category**: The domain (e.g., `playback`, `settings`, `pdf`)
- **action**: The specific action (e.g., `started`, `clicked`, `failed`)
- **detail**: Optional additional context (e.g., `play_clicked`)

## Event Groups

| Group | Description | Labels |
|-------|-------------|--------|
| `system` | Extension lifecycle events | `background`, `popup`, `content`, `settings` |
| `user` | User-initiated actions | `playback`, `paragraph`, `selection` |
| `playback` | Audio playback pipeline | `tts`, `audio`, `cache`, `highlight` |
| `pdf` | PDF processing | `pdf` |
| `network` | API requests | `api` |
| `shipper` | Telemetry health | `shipper` |
| `error` | Error events | `error` |

## System Events

### Lifecycle Events

| Event | Level | Description | Data Fields |
|-------|-------|-------------|-------------|
| `background.started` | info | Background script initialized | - |
| `background.suspended` | info | Background script suspending | - |
| `background.woken` | info | Background script woken from idle | - |
| `popup.opened` | info | Popup opened by user | - |
| `popup.closed` | info | Popup closed | - |
| `content.injected` | info | Content script injected | `isPdf`, `urlHash` |
| `content.cleanup` | debug | Content script cleanup | - |
| `settings.opened` | info | Settings page opened | - |
| `settings.closed` | info | Settings page closed | - |

### Extension Events

| Event | Level | Description | Data Fields |
|-------|-------|-------------|-------------|
| `extension.installed` | info | Extension first installed | `version` |
| `extension.updated` | info | Extension updated | `previousVersion`, `version` |

## User Interaction Events

### Playback Controls

| Event | Level | Description | Data Fields |
|-------|-------|-------------|-------------|
| `playback.play_clicked` | info | Play button clicked | - |
| `playback.pause_clicked` | info | Pause button clicked | - |
| `playback.stop_clicked` | info | Stop button clicked | - |
| `playback.skip_clicked` | info | Skip button clicked | `direction` |
| `playback.speed_changed` | info | Speed slider changed | `speed` |

### Content Interaction

| Event | Level | Description | Data Fields |
|-------|-------|-------------|-------------|
| `paragraph.clicked` | info | Paragraph clicked to start reading | `paragraphIndex` |
| `paragraph.hover_preview` | debug | Paragraph hover preview shown | `paragraphIndex`, `previewDurationMs` |
| `selection.read_requested` | info | Selected text read requested | `charCount` |

### Queue Management

| Event | Level | Description | Data Fields |
|-------|-------|-------------|-------------|
| `queue.opened` | info | Queue panel opened | - |
| `queue.item_added` | info | Item added to queue | - |
| `queue.item_removed` | info | Item removed from queue | - |
| `queue.reordered` | info | Queue reordered | - |

## Settings Events

| Event | Level | Description | Data Fields |
|-------|-------|-------------|-------------|
| `settings.provider_changed` | info | TTS provider changed | `from`, `to` |
| `settings.voice_changed` | info | Voice selection changed | `voiceId` |
| `settings.quick_setting_changed` | info | Quick setting toggle changed | `setting`, `value` |
| `settings.api_key_tested` | info | API key test initiated | `provider` |
| `settings.api_key_test_success` | info | API key test succeeded | `provider` |
| `settings.api_key_test_failed` | warn | API key test failed | `provider`, `error` |
| `settings.saved` | info | Settings saved | - |
| `settings.telemetry_enabled` | info | Telemetry enabled | - |
| `settings.telemetry_disabled` | info | Telemetry disabled | - |

## Playback Pipeline Events

### State Changes

| Event | Level | Description | Data Fields |
|-------|-------|-------------|-------------|
| `playback.start_requested` | debug | Playback start requested | `paragraphCount` |
| `playback.state_changed` | info | Playback state changed | `from`, `to`, `durationMs` |
| `playback.paragraph_started` | debug | Paragraph playback started | `paragraphIndex` |
| `playback.paragraph_completed` | debug | Paragraph playback completed | `paragraphIndex`, `durationMs` |
| `playback.completed` | info | All playback completed | `totalParagraphs`, `totalDurationMs` |
| `playback.cancelled` | info | Playback cancelled by user | `reason` |

### TTS Generation

| Event | Level | Description | Data Fields |
|-------|-------|-------------|-------------|
| `tts.request_started` | debug | TTS request started | `provider`, `charCount` |
| `tts.request_completed` | info | TTS request completed | `provider`, `durationMs`, `audioSizeBytes` |
| `tts.request_failed` | error | TTS request failed | `provider`, `error` |
| `tts.cache_hit` | debug | TTS result served from cache | `provider`, `cacheKey` |
| `tts.cache_miss` | debug | TTS cache miss, generating | `provider` |

### Audio Playback

| Event | Level | Description | Data Fields |
|-------|-------|-------------|-------------|
| `audio.load_started` | debug | Audio loading started | - |
| `audio.load_completed` | debug | Audio loaded successfully | `durationMs` |
| `audio.load_failed` | error | Audio failed to load | `error` |
| `audio.playback_started` | debug | Audio playback started | - |
| `audio.playback_ended` | debug | Audio playback ended | - |
| `audio.playback_error` | error | Audio playback error | `error` |

### Cache Operations

| Event | Level | Description | Data Fields |
|-------|-------|-------------|-------------|
| `cache.store_started` | debug | Cache store started | `key`, `sizeBytes` |
| `cache.store_completed` | debug | Cache store completed | `key` |
| `cache.store_failed` | error | Cache store failed | `key`, `error` |
| `cache.eviction_started` | debug | Cache eviction started | `reason` |
| `cache.eviction_completed` | debug | Cache eviction completed | `evictedCount`, `freedBytes` |
| `cache.cleanup_started` | debug | Periodic cleanup started | - |
| `cache.cleanup_completed` | debug | Periodic cleanup completed | `removedCount` |

### Highlight Sync

| Event | Level | Description | Data Fields |
|-------|-------|-------------|-------------|
| `highlight.sync_started` | debug | Highlight sync started | - |
| `highlight.sync_completed` | debug | Highlight sync completed | - |
| `highlight.sync_failed` | error | Highlight sync failed | `error` |
| `highlight.word_updated` | debug | Word highlight updated | `wordIndex` |

## PDF Events

| Event | Level | Description | Data Fields |
|-------|-------|-------------|-------------|
| `pdf.detected` | info | PDF document detected | `pageCount`, `pdfScheme` |
| `pdf.load_started` | debug | PDF loading started | - |
| `pdf.load_completed` | info | PDF loaded successfully | `pageCount`, `durationMs` |
| `pdf.load_failed` | error | PDF failed to load | `error` |
| `pdf.text_extracted` | debug | Text extracted from PDF | `pageNumber`, `charCount` |
| `pdf.text_extraction_failed` | error | PDF text extraction failed | `pageNumber`, `error` |
| `pdf.page_changed` | debug | PDF page changed | `fromPage`, `toPage` |

## Network Events

| Event | Level | Description | Data Fields |
|-------|-------|-------------|-------------|
| `api.request_started` | debug | API request started | `provider`, `endpoint` |
| `api.request_completed` | debug | API request completed | `provider`, `durationMs`, `statusCode` |
| `api.request_failed` | error | API request failed | `provider`, `error`, `statusCode` |
| `api.rate_limited` | warn | API rate limit hit | `provider`, `retryAfterMs` |
| `api.auth_failed` | error | API authentication failed | `provider` |

## Shipper Health Events

| Event | Level | Description | Data Fields |
|-------|-------|-------------|-------------|
| `shipper.flush_started` | debug | Event flush started | `eventCount` |
| `shipper.flush_completed` | info | Event flush completed | `eventCount`, `durationMs` |
| `shipper.flush_failed` | warn | Event flush failed | `error`, `eventCount` |
| `shipper.circuit_opened` | warn | Circuit breaker opened | `consecutiveFailures` |
| `shipper.circuit_closed` | info | Circuit breaker closed | - |
| `shipper.retry_scheduled` | debug | Retry scheduled | `attemptNumber`, `delayMs` |
| `shipper.buffer_overflow` | warn | Buffer overflow, events dropped | `droppedCount` |

## Error Events

| Event | Level | Description | Data Fields |
|-------|-------|-------------|-------------|
| `error.uncaught_exception` | error | Uncaught JavaScript exception | `message`, `stack`, `fingerprint` |
| `error.unhandled_rejection` | error | Unhandled Promise rejection | `message`, `stack`, `fingerprint` |
| `error.handler_exception` | error | Handler threw exception | `handler`, `message`, `stack` |
| `error.tts_generation` | error | TTS generation error | `provider`, `message` |
| `error.audio_playback` | error | Audio playback error | `message` |
| `error.pdf_processing` | error | PDF processing error | `message` |
| `error.cache_operation` | error | Cache operation error | `operation`, `message` |
| `error.network` | error | Network error | `message` |

## Data Field Reference

### Common Fields (All Events)

| Field | Type | Description |
|-------|------|-------------|
| `ts` | string | ISO 8601 timestamp |
| `event` | string | Event name |
| `eventGroup` | enum | Event category |
| `level` | enum | Log level (debug/info/warn/error) |
| `msg` | string | Human-readable message |
| `entrypoint` | enum | Extension context |
| `extVersion` | string | Extension version |
| `installId` | UUID | Stable install identifier |
| `sessionId` | UUID | Browser session identifier |
| `actionId` | UUID? | Optional correlation ID |
| `provider` | enum? | Current TTS provider |
| `urlHash` | string? | SHA-256 hash of URL |
| `data` | object? | Event-specific data |

### Enums

**Log Level**: `debug`, `info`, `warn`, `error`

**Entrypoint**: `background`, `popup`, `options`, `content`

**Provider**: `browser`, `elevenlabs`, `openai`, `groq`, `cartesia`

**Event Group**: `user`, `system`, `playback`, `pdf`, `network`, `shipper`, `error`
