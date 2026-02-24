# Cache Key Derivation

**Last Updated**: 2026-01-20
**Feature Branch**: `047-architecture-ui-polish`

This document describes Proso's cache key derivation strategy for the Smart Audio Cache system.

---

## Decision

Use a deterministic cache key format combining URL, paragraph index, provider, voice, and content hash. This enables:
- Cache hits when the same content is requested with same provider/voice
- Cache reuse across sessions
- Efficient cache invalidation by URL or content change

---

## Key Format

```
{normalizedUrl}:{paragraphIndex}:{provider}:{voice}:{contentHash}
```

**Example**:
```
example.com/article:3:elevenlabs:rachel:a1b2c3d4e5f6g7h8
```

### Components

| Component | Description | Example |
|-----------|-------------|---------|
| `normalizedUrl` | Hostname + pathname (no protocol, query, hash) | `example.com/article` |
| `paragraphIndex` | 0-based paragraph position | `3` |
| `provider` | TTS provider identifier | `elevenlabs` |
| `voice` | Voice identifier | `rachel` |
| `contentHash` | SHA-256 truncated to 16 hex chars | `a1b2c3d4e5f6g7h8` |

---

## URL Normalization

URLs are normalized to enable cache sharing across:
- HTTP vs HTTPS (same content, different protocol)
- URLs with vs without trailing slashes
- URLs with different query parameters (same article, different tracking params)

### Normalization Rules

```typescript
function normalizeUrl(url: string): string {
  const urlObj = new URL(url);
  let normalized = urlObj.hostname + urlObj.pathname;
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}
```

**Preserved**: hostname, pathname, port (if non-standard)
**Stripped**: protocol, query parameters, hash fragments, trailing slashes

### Examples

| Input | Normalized |
|-------|------------|
| `https://example.com/article` | `example.com/article` |
| `http://example.com/article/` | `example.com/article` |
| `https://example.com/article?ref=123` | `example.com/article` |
| `https://example.com/article#section` | `example.com/article` |
| `https://sub.example.com/path/page` | `sub.example.com/path/page` |

---

## Content Hashing

Content hashes detect when paragraph text changes, invalidating stale cache entries.

### SHA-256 (Primary)

Used in async contexts via Web Crypto API:

```typescript
async function generateContentHash(text: string): Promise<string> {
  const normalized = text.trim().normalize('NFC');
  const data = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.slice(0, 16);
}
```

### djb2 (Fallback)

Used in sync contexts or where Web Crypto is unavailable:

```typescript
function generateContentHashSync(text: string): string {
  const normalized = text.trim().normalize('NFC');
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 33) ^ normalized.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(16, '0').slice(0, 16);
}
```

### Hash Properties

- **16 hex characters** = 64 bits of entropy
- **Collision probability**: ~1 in 18 quintillion for random inputs
- **Truncation tradeoff**: Shorter keys vs slightly higher collision chance
- **Unicode normalization**: NFC ensures consistent hashing across platforms

---

## Cache Key Operations

### Generation

```typescript
// Sync (with pre-computed hash)
const key = generateCacheKey(url, paragraphIndex, provider, voice, contentHash);

// Async (computes hash from text)
const key = await generateCacheKeyFromText(url, paragraphIndex, provider, voice, text);
```

### Parsing

```typescript
const parsed = parseCacheKey('example.com/article:3:openai:alloy:hash123');
// { url: 'example.com/article', paragraphIndex: 3, provider: 'openai', voice: 'alloy', contentHash: 'hash123' }
```

### Validation

```typescript
isValidCacheKey('example.com/article:3:openai:alloy:hash123'); // true
isValidCacheKey('invalid'); // false
```

### Content Comparison

```typescript
// Same content, different provider/voice
isSameContent(
  'example.com/article:3:openai:alloy:hash123',
  'example.com/article:3:elevenlabs:rachel:hash123'
); // true

// Different content
isSameContent(
  'example.com/article:3:openai:alloy:hash123',
  'example.com/article:3:openai:alloy:hash456'
); // false
```

---

## Implementation Location

All cache key logic is centralized in:

```
src/utils/cache/cache-key.ts (206 lines)
```

**Exports**:
- `generateContentHash(text)` - Async SHA-256 hash
- `generateContentHashSync(text)` - Sync djb2 hash
- `normalizeUrl(url)` - URL normalization
- `generateCacheKey(...)` - Key generation with pre-computed hash
- `generateCacheKeyFromText(...)` - Key generation with text hashing
- `parseCacheKey(key)` - Parse key to components
- `isValidCacheKey(key)` - Format validation
- `isSameContent(key1, key2)` - Content comparison
- `getUrlPattern(url)` - URL prefix for bulk operations

---

## Test Coverage

Tests are located in `tests/unit/cache/cache-key.test.ts` and cover:

- URL normalization (protocol, query params, hash, trailing slashes)
- Content hash consistency
- Key generation and parsing round-trip
- Provider/voice case sensitivity
- Edge cases (unicode, empty strings, long text)

---

## Rationale

### Why include content hash?

- Detects when page content changes
- Prevents serving stale audio for updated articles
- Enables cache sharing when content is republished at new URL

### Why 16 characters?

- Balances uniqueness with storage efficiency
- 64 bits is more than sufficient for paragraph-level uniqueness
- Reduces key size by 75% vs full SHA-256

### Why normalize URLs?

- Enables cache hits across HTTP/HTTPS
- Avoids duplicate entries for same content with different tracking params
- Reduces cache pollution from URL variations

---

## References

- [Web Crypto API - SubtleCrypto.digest()](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest)
- [djb2 Hash Algorithm](http://www.cse.yorku.ca/~oz/hash.html)
- [Unicode Normalization Forms](https://unicode.org/reports/tr15/)
