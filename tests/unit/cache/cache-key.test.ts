/**
 * Unit tests for cache key generation
 *
 * @module tests/unit/cache/cache-key.test
 */

import {
  generateCacheKey,
  generateContentHash,
  generateContentHashSync,
  parseCacheKey,
  isValidCacheKey,
  isSameContent,
  normalizeUrl,
  getUrlPattern,
} from '../../../src/utils/cache/cache-key';

describe('cache-key', () => {
  describe('normalizeUrl', () => {
    it('should extract hostname and pathname', () => {
      expect(normalizeUrl('https://example.com/article/123')).toBe(
        'example.com/article/123'
      );
    });

    it('should remove protocol', () => {
      expect(normalizeUrl('http://example.com/page')).toBe('example.com/page');
    });

    it('should remove query parameters', () => {
      expect(normalizeUrl('https://example.com/article?id=123&ref=test')).toBe(
        'example.com/article'
      );
    });

    it('should remove hash', () => {
      expect(normalizeUrl('https://example.com/article#section1')).toBe(
        'example.com/article'
      );
    });

    it('should remove trailing slash', () => {
      expect(normalizeUrl('https://example.com/article/')).toBe(
        'example.com/article'
      );
    });

    it('should handle root path', () => {
      expect(normalizeUrl('https://example.com/')).toBe('example.com');
    });

    it('should handle complex URLs', () => {
      expect(
        normalizeUrl('https://sub.example.com/path/to/article?query=1#hash')
      ).toBe('sub.example.com/path/to/article');
    });
  });

  describe('generateContentHashSync', () => {
    it('should generate consistent hash for same text', () => {
      const hash1 = generateContentHashSync('Hello, world!');
      const hash2 = generateContentHashSync('Hello, world!');
      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different text', () => {
      const hash1 = generateContentHashSync('Hello, world!');
      const hash2 = generateContentHashSync('Goodbye, world!');
      expect(hash1).not.toBe(hash2);
    });

    it('should return 16 character hex string', () => {
      const hash = generateContentHashSync('Test content');
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should trim whitespace before hashing', () => {
      const hash1 = generateContentHashSync('  Hello  ');
      const hash2 = generateContentHashSync('Hello');
      expect(hash1).toBe(hash2);
    });
  });

  describe('generateContentHash (async)', () => {
    const hasWebCrypto = typeof crypto !== 'undefined' && crypto.subtle;

    it('should generate consistent hash for same text', async () => {
      if (!hasWebCrypto) {
        // Skip in environments without Web Crypto API
        return;
      }
      const hash1 = await generateContentHash('Hello, world!');
      const hash2 = await generateContentHash('Hello, world!');
      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different text', async () => {
      if (!hasWebCrypto) {
        return;
      }
      const hash1 = await generateContentHash('Hello, world!');
      const hash2 = await generateContentHash('Goodbye, world!');
      expect(hash1).not.toBe(hash2);
    });

    it('should return 16 character hex string', async () => {
      if (!hasWebCrypto) {
        return;
      }
      const hash = await generateContentHash('Test content');
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe('generateCacheKey', () => {
    it('should generate key with all components', () => {
      const key = generateCacheKey(
        'https://example.com/article',
        3,
        'openai',
        'alloy',
        'a1b2c3d4e5f6g7h8'
      );
      expect(key).toBe('example.com/article:3:openai:alloy:a1b2c3d4e5f6g7h8');
    });

    it('should normalize URL in key', () => {
      const key = generateCacheKey(
        'https://example.com/article?query=1',
        0,
        'browser',
        'default',
        'hash123'
      );
      expect(key.startsWith('example.com/article:')).toBe(true);
    });

    it('should handle paragraph index 0', () => {
      const key = generateCacheKey(
        'https://example.com/page',
        0,
        'openai',
        'nova',
        'abcd1234'
      );
      expect(key).toContain(':0:');
    });
  });

  describe('parseCacheKey', () => {
    it('should parse valid cache key', () => {
      const result = parseCacheKey(
        'example.com/article:3:openai:alloy:a1b2c3d4e5f6g7h8'
      );
      expect(result).toEqual({
        url: 'example.com/article',
        paragraphIndex: 3,
        provider: 'openai',
        voice: 'alloy',
        contentHash: 'a1b2c3d4e5f6g7h8',
      });
    });

    it('should return null for invalid key - too few parts', () => {
      expect(parseCacheKey('example.com:3:openai')).toBeNull();
    });

    it('should return null for invalid paragraph index', () => {
      expect(parseCacheKey('example.com/article:abc:openai:alloy:hash')).toBeNull();
    });

    it('should return null for negative paragraph index', () => {
      expect(parseCacheKey('example.com/article:-1:openai:alloy:hash')).toBeNull();
    });

    it('should handle hash with colons', () => {
      const result = parseCacheKey(
        'example.com/article:0:provider:voice:hash:with:colons'
      );
      expect(result?.contentHash).toBe('hash:with:colons');
    });
  });

  describe('isValidCacheKey', () => {
    it('should return true for valid key', () => {
      expect(
        isValidCacheKey('example.com/article:3:openai:alloy:a1b2c3d4e5f6g7h8')
      ).toBe(true);
    });

    it('should return false for invalid key', () => {
      expect(isValidCacheKey('invalid-key')).toBe(false);
    });
  });

  describe('isSameContent', () => {
    it('should return true for same content different provider', () => {
      const key1 = 'example.com/article:3:openai:alloy:hash123';
      const key2 = 'example.com/article:3:elevenlabs:rachel:hash123';
      expect(isSameContent(key1, key2)).toBe(true);
    });

    it('should return false for different paragraph', () => {
      const key1 = 'example.com/article:3:openai:alloy:hash123';
      const key2 = 'example.com/article:4:openai:alloy:hash123';
      expect(isSameContent(key1, key2)).toBe(false);
    });

    it('should return false for different content hash', () => {
      const key1 = 'example.com/article:3:openai:alloy:hash123';
      const key2 = 'example.com/article:3:openai:alloy:hash456';
      expect(isSameContent(key1, key2)).toBe(false);
    });

    it('should return false for invalid keys', () => {
      expect(isSameContent('invalid', 'also-invalid')).toBe(false);
    });
  });

  describe('getUrlPattern', () => {
    it('should return URL prefix with colon', () => {
      expect(getUrlPattern('https://example.com/article')).toBe(
        'example.com/article:'
      );
    });

    it('should normalize URL in pattern', () => {
      expect(getUrlPattern('https://example.com/page?query=1#hash')).toBe(
        'example.com/page:'
      );
    });
  });
});
