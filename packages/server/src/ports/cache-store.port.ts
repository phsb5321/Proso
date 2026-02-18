// Cache store port — abstract contract for audio caching
// ZERO NestJS imports — used as DI token via abstract class
//
// Enforces:
//   INV-006: Cached content never re-charges

export abstract class CacheStorePort {
  abstract get(key: string): Promise<Buffer | null>;
  abstract set(key: string, data: Buffer, ttlSeconds?: number): Promise<void>;
  abstract has(key: string): Promise<boolean>;
  abstract delete(key: string): Promise<void>;
}
