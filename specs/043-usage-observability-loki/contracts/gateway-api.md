# Spec 043: Gateway API Contract

## Base URL

```
https://voxpage-log-gateway.<dokku-domain>/
```

## Authentication

All endpoints require Bearer token authentication:

```http
Authorization: Bearer <gateway-token>
```

## Endpoints

### POST /ingest

Ingest a batch of usage events.

#### Request

**Headers**:
```http
Content-Type: application/json
Authorization: Bearer <token>
Content-Encoding: gzip  # Optional, for compressed payloads
```

**Body**:
```json
{
  "events": [
    {
      "ts": "2026-01-10T15:22:31.123Z",
      "event": "playback.start_requested",
      "eventGroup": "playback",
      "level": "info",
      "msg": "Playback started",
      "entrypoint": "background",
      "extVersion": "1.0.0",
      "installId": "550e8400-e29b-41d4-a716-446655440000",
      "sessionId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "actionId": "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
      "provider": "elevenlabs",
      "data": {
        "paragraphs": 15
      }
    }
  ]
}
```

**Constraints**:
- `events` array: 1-1000 items
- Total payload size: max 5MB (uncompressed)
- Individual event `data` field: max 10KB

#### Response

**Success (204 No Content)**:
```http
HTTP/1.1 204 No Content
```

**Validation Error (400 Bad Request)**:
```json
{
  "error": "validation_error",
  "details": [
    {
      "path": "events[0].eventGroup",
      "message": "Invalid enum value. Expected 'user' | 'system' | 'playback' | 'pdf' | 'network' | 'shipper' | 'error'"
    }
  ]
}
```

**Authentication Error (401 Unauthorized)**:
```json
{
  "error": "unauthorized",
  "message": "Invalid or missing authorization token"
}
```

**Rate Limit (429 Too Many Requests)**:
```json
{
  "error": "rate_limited",
  "retryAfter": 60
}
```

**Gateway Error (502 Bad Gateway)**:
```json
{
  "error": "loki_unavailable",
  "message": "Failed to forward events to Loki"
}
```

### GET /health

Health check endpoint (no auth required).

#### Response

**Healthy (200 OK)**:
```json
{
  "status": "healthy",
  "loki": "connected",
  "version": "1.0.0",
  "uptime": 3600
}
```

**Unhealthy (503 Service Unavailable)**:
```json
{
  "status": "unhealthy",
  "loki": "disconnected",
  "version": "1.0.0",
  "uptime": 3600,
  "error": "Loki connection timeout"
}
```

### GET /metrics

Prometheus metrics endpoint (internal use).

#### Response

```
# HELP gateway_events_received_total Total events received
# TYPE gateway_events_received_total counter
gateway_events_received_total 12345

# HELP gateway_events_forwarded_total Total events forwarded to Loki
# TYPE gateway_events_forwarded_total counter
gateway_events_forwarded_total 12340

# HELP gateway_events_failed_total Total events that failed to forward
# TYPE gateway_events_failed_total counter
gateway_events_failed_total 5

# HELP gateway_loki_latency_seconds Loki push latency histogram
# TYPE gateway_loki_latency_seconds histogram
gateway_loki_latency_seconds_bucket{le="0.1"} 10000
gateway_loki_latency_seconds_bucket{le="0.5"} 12000
gateway_loki_latency_seconds_bucket{le="1"} 12300
gateway_loki_latency_seconds_bucket{le="+Inf"} 12340
```

## Rate Limiting

| Limit | Value | Window |
|-------|-------|--------|
| Requests per IP | 100 | 1 minute |
| Events per request | 1000 | - |
| Payload size | 5 MB | - |

Rate limit headers are included in all responses:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704895411
```

## Error Codes

| HTTP Status | Error Code | Description |
|-------------|------------|-------------|
| 400 | `validation_error` | Request body failed schema validation |
| 401 | `unauthorized` | Missing or invalid Bearer token |
| 413 | `payload_too_large` | Request body exceeds 5MB |
| 429 | `rate_limited` | Too many requests |
| 500 | `internal_error` | Unexpected server error |
| 502 | `loki_unavailable` | Failed to forward to Loki |
| 503 | `service_unavailable` | Gateway is shutting down |

## Security

### Token Validation
- Constant-time string comparison to prevent timing attacks
- Failed auth attempts count toward rate limit

### Request Validation
- JSON schema validation using Zod
- Maximum field lengths enforced
- No HTML/script injection possible (JSON only)

### Privacy
- No PII logging in gateway logs
- `installId` and `sessionId` are UUIDs (not user-identifiable)
- URLs are SHA-256 hashed before transmission

## Example cURL

```bash
curl -X POST https://voxpage-log-gateway.example.com/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_live_xxxxx" \
  -d '{
    "events": [{
      "ts": "2026-01-10T15:22:31.123Z",
      "event": "popup.opened",
      "eventGroup": "user",
      "level": "info",
      "msg": "Popup opened",
      "entrypoint": "popup",
      "extVersion": "1.0.0",
      "installId": "550e8400-e29b-41d4-a716-446655440000",
      "sessionId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
    }]
  }'
```
