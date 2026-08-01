# Spec 043: Requirements Checklist

## Goal 1: 100% Usage Tracking

### User Interactions
- [X] `popup.opened` - Popup opened
- [X] `popup.closed` - Popup closed
- [X] `playback.play_clicked` - Play button clicked
- [X] `playback.pause_clicked` - Pause button clicked
- [X] `playback.stop_clicked` - Stop button clicked
- [X] `playback.next_clicked` - Next paragraph clicked
- [X] `playback.prev_clicked` - Previous paragraph clicked
- [X] `playback.seek_clicked` - Seek slider used
- [X] `playback.speed_changed` - Speed changed
- [X] `settings.opened` - Settings page opened
- [X] `settings.provider_changed` - TTS provider changed
- [X] `settings.voice_changed` - Voice selection changed
- [X] `settings.api_key_test_clicked` - API key test initiated
- [X] `settings.api_key_test_result` - API key test completed
- [X] `settings.saved` - Settings saved
- [X] `queue.opened` - Queue panel opened
- [X] `queue.item_added` - Item added to queue
- [X] `queue.item_removed` - Item removed from queue
- [X] `queue.reordered` - Queue reordered
- [X] `paragraph.clicked` - Paragraph clicked for playback
- [X] `paragraph.hovered` - Paragraph hover preview

### System/Lifecycle
- [X] `extension.installed` - Extension installed
- [X] `extension.updated` - Extension updated
- [X] `background.started` - Background script started
- [X] `background.suspended` - Background script about to suspend
- [X] `content.injected` - Content script injected
- [X] `content.unloaded` - Content script unloaded
- [X] `container.initialized` - Hexagonal container initialized
- [X] `flags.snapshot` - Migration flags snapshot
- [X] `storage.quota_warning` - Storage quota warning

### Playback Pipeline
- [X] `playback.start_requested` - Playback start requested
- [X] `playback.state_changed` - State transition
- [X] `playback.completed` - Playback completed
- [X] `tts.request_started` - TTS generation started
- [X] `tts.request_completed` - TTS generation finished (as `tts.request_completed`)
- [X] `audio.cache_hit` - Audio cache hit
- [X] `audio.cache_miss` - Audio cache miss
- [X] `prefetch.started` - Prefetch started
- [X] `prefetch.completed` - Prefetch completed
- [X] `highlight.word_sync` - Word highlight synced

### PDF Subsystem
- [X] `pdf.detected` - PDF detected
- [X] `pdf.extraction_started` - PDF extraction started
- [X] `pdf.extraction_completed` - PDF extraction completed
- [X] `pdf.blocked_file_scheme` - file:// PDF blocked
- [X] `pdf.error_security` - PDF security error
- [X] `pdf.error_fetch` - PDF fetch error
- [X] `pdf.password_required` - Password-protected PDF
- [X] `pdf.ocr_started` - OCR started
- [X] `pdf.ocr_completed` - OCR completed

### Network/Timing
- [X] `api.request_started` - API request started
- [X] `api.request_completed` - API request completed
- [X] `api.request_failed` - API request failed
- [X] `api.rate_limited` - Rate limit hit

### Shipper Health
- [X] `shipper.batch_queued` - Batch queued for sending
- [X] `shipper.batch_sent` - Batch sent successfully
- [X] `shipper.batch_failed` - Batch send failed
- [X] `shipper.retry_scheduled` - Retry scheduled
- [X] `shipper.circuit_opened` - Circuit breaker opened
- [X] `shipper.circuit_closed` - Circuit breaker closed
- [X] `shipper.buffer_depth` - Buffer depth report
- [X] `shipper.buffer_overflow` - Buffer overflow, events dropped

### Errors
- [X] `error.uncaught` - Uncaught exception
- [X] `error.unhandled_rejection` - Unhandled Promise rejection
- [X] `error.handler_exception` - Handler threw exception
- [X] `error.message_dispatch` - Message dispatch error
- [X] `error.validation` - Schema validation error

---

## Goal 2: Reliable Delivery

### Buffer Persistence
- [X] Events persist in IndexedDB across browser restarts
- [X] Buffer has configurable max size (default 10MB)
- [X] Old events (>14 days) are automatically cleaned up
- [X] Oldest events evicted when buffer is full
- [X] Buffer depth tracked and reported

### Retry Logic
- [X] Exponential backoff with jitter implemented
- [X] Maximum retry count configurable
- [X] Retry delay capped at configurable maximum
- [X] Failed batches returned to buffer for later retry

### Circuit Breaker
- [X] Opens after N consecutive failures (default 5)
- [X] Auto-closes after timeout (default 60s)
- [X] Circuit state logged to telemetry
- [X] Circuit state persists across restarts

### Flush Triggers
- [X] Periodic flush on interval (default 30s)
- [X] Immediate flush on error events
- [X] Flush when batch size threshold reached
- [X] Best-effort flush on background suspend

---

## Goal 3: Low-Cardinality Labels

### Loki Labels (MUST be low-cardinality)
- [X] `app` - Always "voxpage" (1 value)
- [X] `env` - "dev", "staging", "prod" (3 values)
- [X] `entrypoint` - "background", "popup", "options", "content" (4 values)
- [X] `level` - "debug", "info", "warn", "error" (4 values)
- [X] `event_group` - 7 values
- [X] `ext_version` - Limited versions in production
- [X] `provider` - 5 values

### JSON Body (high-cardinality data)
- [X] `installId` in body, NOT label
- [X] `sessionId` in body, NOT label
- [X] `actionId` in body, NOT label
- [X] `urlHash` in body, NOT label
- [X] `event` name in body, NOT label

---

## Goal 4: Agent-Friendly Retrieval

### Query Scripts
- [X] `query-session.sh` - Query logs by sessionId
- [X] `query-errors.sh` - Query error logs in time range
- [X] `query-user.sh` - Query logs by installId
- [X] Scripts work via SSH to Dokku host
- [X] README with usage examples

### Documentation
- [X] LogQL query examples documented
- [X] Session reconstruction guide
- [X] Debugging workflow documented

---

## Goal 5: E2E Verification

### Test Coverage
- [X] E2E test loads extension in real Firefox
- [X] E2E test performs user actions that generate events
- [X] E2E test verifies events arrive in Loki within 60s
- [X] E2E test verifies session can be reconstructed

### CI Integration
- [X] E2E telemetry tests run in CI
- [X] Loki available in CI environment
- [X] Test failures fail the build

---

## Security Requirements

### Redaction
- [X] API keys redacted from all events
- [X] Bearer tokens redacted
- [X] Passwords redacted
- [X] URLs hashed with SHA-256
- [X] Page content never logged

### Authentication
- [X] Gateway requires Bearer token
- [X] Token comparison is constant-time
- [X] Rate limiting on all endpoints
- [X] Failed auth counts toward rate limit

### Privacy
- [X] No PII in logs
- [X] installId/sessionId are UUIDs (not user-identifiable)
- [X] URL hashing prevents URL reconstruction

---

## Non-Functional Requirements

### Performance
- [X] Event tracking adds <1ms overhead
- [X] Buffer operations are async (non-blocking)
- [X] Shipper runs in background (non-blocking)
- [X] No memory leaks in long-running sessions

### Reliability
- [ ] <0.1% event loss under normal conditions (requires production metrics)
- [ ] 95th percentile delivery <5s in normal conditions (requires production metrics)
- [X] Buffer survives browser crash/restart

### Configuration
- [X] Master enable/disable flag
- [X] Configurable gateway URL
- [X] Configurable buffer limits
- [X] Configurable flush intervals
- [X] Debug mode for development
