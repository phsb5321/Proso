# Spec 043: Task Breakdown

## Implementation Status

**All 22 tasks completed!** ✅

| Task | Status | Commit |
|------|--------|--------|
| T001 | ✅ Complete | `bc6aa4f` |
| T002 | ✅ Complete | `bc6aa4f` |
| T003 | ✅ Complete | `bc6aa4f` |
| T004 | ✅ Complete | `bc6aa4f` |
| T005 | ✅ Complete | `bc6aa4f` |
| T006 | ✅ Complete | `bc6aa4f` |
| T007 | ✅ Complete | `bc6aa4f` |
| T008 | ✅ Complete | `16f1c7b` |
| T009 | ✅ Complete | `16f1c7b` |
| T010 | ✅ Complete | `16f1c7b` |
| T011 | ✅ Complete | `16f1c7b` |
| T012 | ✅ Complete | `16f1c7b` |
| T013 | ✅ Complete | `16f1c7b` |
| T014 | ✅ Complete | `be0f7ef` |
| T015 | ✅ Complete | `e1e2f32` |
| T016 | ✅ Complete | `97a89a8` |
| T017 | ✅ Complete | `acf89e3` |
| T018 | ✅ Complete | `74c53fe` |
| T019 | ✅ Complete | `4033ac6` |
| T020 | ✅ Complete | `85be8ea` |
| T021 | ✅ Complete | `387248d` |
| T022 | ✅ Complete | `8769ffc` |

---

## Phase 1: Core Infrastructure

### T001: Create UsageTracker Types and Interfaces
- **Priority**: P1
- **Estimate**: 2h
- **Dependencies**: None

**Deliverables**:
- `src/utils/telemetry/usage/types.ts`

**Acceptance Criteria**:
- All event types from spec defined with TypeScript types
- Zod schemas for runtime validation
- TypeScript strict mode compatible
- Exported from module index

---

### T002: Implement Context Provider
- **Priority**: P1
- **Estimate**: 3h
- **Dependencies**: T001

**Deliverables**:
- `src/utils/telemetry/usage/context.ts`

**Acceptance Criteria**:
- `installId` persists across browser restarts
- `sessionId` regenerates on each browser session
- `entrypoint` correctly detected in all contexts
- Unit tests for context generation and persistence

---

### T003: Implement Redaction Module
- **Priority**: P1
- **Estimate**: 2h
- **Dependencies**: T001

**Deliverables**:
- `src/utils/telemetry/usage/redaction.ts`

**Acceptance Criteria**:
- API keys redacted from nested objects
- URLs hashed to SHA-256
- Stack traces have file paths normalized
- Unit tests with various sensitive data patterns

---

### T004: Implement IndexedDB Ring Buffer
- **Priority**: P1
- **Estimate**: 4h
- **Dependencies**: T001

**Deliverables**:
- `src/utils/telemetry/usage/buffer.ts`

**Acceptance Criteria**:
- Events persist across browser restart
- Oldest events evicted when buffer full
- TTL expiration works correctly
- Size limits enforced
- Integration tests with real IndexedDB

---

### T005: Implement HTTP Shipper with Retry/Circuit Breaker
- **Priority**: P1
- **Estimate**: 5h
- **Dependencies**: T001, T004

**Deliverables**:
- `src/utils/telemetry/usage/shipper.ts`

**Acceptance Criteria**:
- Exponential backoff with jitter
- Circuit breaker opens after consecutive failures
- Circuit breaker auto-closes after timeout
- Gzip compression for batches > 1KB
- Unit tests for retry and circuit breaker logic

---

### T006: Implement UsageTracker Core Class
- **Priority**: P1
- **Estimate**: 4h
- **Dependencies**: T002, T003, T004, T005

**Deliverables**:
- `src/utils/telemetry/usage/tracker.ts`
- `src/utils/telemetry/usage/index.ts`

**Acceptance Criteria**:
- Events tracked with full context
- Periodic flush works
- Immediate flush on error events
- Shutdown flush works
- Singleton pattern works across module imports

---

### T007: Implement Global Error Capture
- **Priority**: P1
- **Estimate**: 2h
- **Dependencies**: T006

**Deliverables**:
- `src/utils/telemetry/usage/error-capture.ts`

**Acceptance Criteria**:
- Uncaught exceptions captured with stack trace
- Unhandled rejections captured
- Error fingerprinting for deduplication
- Cleanup function removes listeners

---

## Phase 2: Gateway Service

### T008: Create Dokku Gateway Service Scaffold
- **Priority**: P1
- **Estimate**: 2h
- **Dependencies**: None

**Deliverables**:
- `services/voxpage-log-gateway/package.json`
- `services/voxpage-log-gateway/tsconfig.json`
- `services/voxpage-log-gateway/Dockerfile`
- `services/voxpage-log-gateway/Procfile`
- `services/voxpage-log-gateway/env.example`

**Acceptance Criteria**:
- Node.js/Express project structure
- TypeScript configuration
- Dockerfile builds successfully
- Procfile defines web process for Dokku

---

### T009: Implement Gateway Authentication Middleware
- **Priority**: P1
- **Estimate**: 2h
- **Dependencies**: T008

**Deliverables**:
- `services/voxpage-log-gateway/src/middleware/auth.ts`

**Acceptance Criteria**:
- Rejects requests without Bearer token
- Constant-time token comparison
- Unit tests for auth scenarios

---

### T010: Implement Gateway Rate Limiting
- **Priority**: P1
- **Estimate**: 2h
- **Dependencies**: T008

**Deliverables**:
- `services/voxpage-log-gateway/src/middleware/rate-limit.ts`

**Acceptance Criteria**:
- Rate limits enforced per IP
- 401 responses count toward limit
- Standard rate limit headers returned

---

### T011: Implement Gateway Schema Validation
- **Priority**: P1
- **Estimate**: 2h
- **Dependencies**: T008, T001

**Deliverables**:
- `services/voxpage-log-gateway/src/middleware/validate.ts`

**Acceptance Criteria**:
- Rejects invalid event schemas
- Enforces max batch size
- Returns helpful validation errors

---

### T012: Implement Loki Push Client
- **Priority**: P1
- **Estimate**: 3h
- **Dependencies**: T008

**Deliverables**:
- `services/voxpage-log-gateway/src/loki/client.ts`

**Acceptance Criteria**:
- Correct Loki push payload format
- Timestamps as nanosecond strings
- Labels are low-cardinality only
- Integration test with Loki

---

### T013: Implement Gateway Ingest Endpoint
- **Priority**: P1
- **Estimate**: 2h
- **Dependencies**: T009, T010, T011, T012

**Deliverables**:
- `services/voxpage-log-gateway/src/routes/ingest.ts`
- `services/voxpage-log-gateway/src/index.ts`

**Acceptance Criteria**:
- Accepts valid event batches
- Returns 204 on success
- Returns 502 on Loki failure
- Supports gzip request bodies

---

## Phase 3: Extension Integration

### T014: Integrate UsageTracker in Background Script
- **Priority**: P1
- **Estimate**: 3h
- **Dependencies**: T006

**Deliverables**:
- Modifications to `src/entrypoints/background.ts`
- Modifications to `src/background/init-hexagonal.ts`

**Acceptance Criteria**:
- Tracker initializes on background start
- `background.started` event logged
- `extension.installed` and `extension.updated` events logged via runtime.onInstalled
- `background.suspended` event logged on beforeunload
- Best-effort flush on suspend
- Config from browser.storage.local (user configurable)
- Respects user opt-out via telemetryEnabled flag

---

### T015: Instrument Message Handlers
- **Priority**: P1
- **Estimate**: 4h
- **Dependencies**: T014

**Deliverables**:
- Modifications to `src/handlers/playback.handlers.ts`
- Modifications to `src/handlers/settings.handlers.ts`
- Modifications to `src/handlers/cache.handlers.ts`
- Modifications to `src/handlers/pdf.handlers.ts`
- Modifications to `src/handlers/footer.handlers.ts`

**Acceptance Criteria**:
- All handlers instrumented with timing
- Errors captured with actionId correlation
- No performance regression (< 1ms overhead)

---

### T016: Integrate Tracker in Popup
- **Priority**: P2
- **Estimate**: 2h
- **Dependencies**: T006

**Deliverables**:
- Modifications to `src/entrypoints/popup/main.ts`

**Acceptance Criteria**:
- Popup lifecycle tracked (`popup.opened`, `popup.closed`)
- Button clicks tracked (play, pause, stop, next, prev)
- Queue panel events tracked (`queue.opened`, `queue.item_added`, `queue.item_removed`, `queue.reordered`)
- No duplicate events on rapid clicks

---

### T017: Integrate Tracker in Content Script
- **Priority**: P2
- **Estimate**: 2h
- **Dependencies**: T006

**Deliverables**:
- Modifications to `src/entrypoints/content.ts`

**Acceptance Criteria**:
- Content injection tracked (`content.injected`)
- Content unload tracked (`content.unloaded`)
- Paragraph clicks tracked (`paragraph.clicked`)
- Paragraph hover preview tracked (`paragraph.hovered`)
- Word highlight sync tracked (`highlight.word_sync`)
- URL hashed for privacy

---

### T018: Integrate Tracker in Options Page
- **Priority**: P2
- **Estimate**: 2h
- **Dependencies**: T006

**Deliverables**:
- Modifications to `src/entrypoints/options/main.ts`

**Acceptance Criteria**:
- Settings page open tracked (`settings.opened`)
- Provider/voice changes tracked
- API key tests tracked (not the key itself!)
- Telemetry opt-out toggle UI added (user can disable telemetry)
- Settings saved event tracked (`settings.saved`)

---

## Phase 4: Agent Retrieval Tools

### T019: Create Loki Query Scripts
- **Priority**: P2
- **Estimate**: 2h
- **Dependencies**: T012

**Deliverables**:
- `scripts/loki/query-session.sh`
- `scripts/loki/query-errors.sh`
- `scripts/loki/query-user.sh`
- `scripts/loki/README.md`

**Acceptance Criteria**:
- Query by sessionId
- Query errors in time range
- Query by installId
- README with usage examples

---

## Phase 5: E2E Verification

### T020: Create E2E Telemetry Tests
- **Priority**: P2
- **Estimate**: 4h
- **Dependencies**: T014, T013

**Deliverables**:
- `tests/e2e/telemetry/event-delivery.e2e.test.ts`

**Acceptance Criteria**:
- Test verifies popup events
- Test verifies playback events
- Test verifies error events
- CI integration with Loki

---

## Phase 6: Documentation and Rollout

### T021: Create Telemetry Documentation
- **Priority**: P3
- **Estimate**: 2h
- **Dependencies**: All above

**Deliverables**:
- `docs/telemetry/README.md`
- `docs/telemetry/event-catalog.md`
- `docs/telemetry/debugging.md`

**Acceptance Criteria**:
- Event catalog complete
- Setup instructions documented
- Debugging guide with LogQL examples

---

### T022: Create Gradual Rollout Plan
- **Priority**: P3
- **Estimate**: 1h
- **Dependencies**: T021

**Deliverables**:
- `docs/telemetry/rollout.md`

**Acceptance Criteria**:
- Rollout phases defined
- Monitoring plan documented
- Rollback procedure documented

---

## Summary

| Phase | Tasks | Total Estimate |
|-------|-------|----------------|
| Phase 1: Core Infrastructure | T001-T007 | 22h |
| Phase 2: Gateway Service | T008-T013 | 13h |
| Phase 3: Extension Integration | T014-T018 | 13h |
| Phase 4: Agent Retrieval | T019 | 2h |
| Phase 5: E2E Verification | T020 | 4h |
| Phase 6: Documentation | T021-T022 | 3h |
| **Total** | **22 tasks** | **~57h** |

## Critical Path

```
T001 ─┬─ T002 ─┬─ T006 ─── T007 ─── T014 ─── T015
      ├─ T003 ─┤
      ├─ T004 ─┘
      └─ T005 ───┘

T008 ─┬─ T009 ─┬─ T013
      ├─ T010 ─┤
      ├─ T011 ─┤
      └─ T012 ─┘
```

Phases 1 and 2 can be worked in parallel.
