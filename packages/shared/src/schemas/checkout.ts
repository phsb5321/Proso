// Post-checkout licence retrieval contract
//
// A buyer completes Paddle's overlay checkout and lands on the site's success
// page holding exactly one thing: the Paddle transaction id. This contract is
// how that id is exchanged for the licence key the purchase minted.
//
// Consumers:
//   - packages/site/assets/js/success.js — the post-checkout page (hand-written
//     validation; the static site has no bundler and cannot import zod)
//   - packages/server — issuance endpoint (Feature 148)
//
// Transport: POST, so the transaction id never lands in a URL, a proxy log, or
// a Referer header. The endpoint is unauthenticated by design — Proso has no
// signup surface (INV-001) and the transaction id is the buyer's only secret,
// so the server side is expected to rate-limit it.
//
//   POST {apiBaseUrl}/api/v1/license/by-transaction
//   body: LicenseByTransactionRequest
//   200  → LicenseIssued
//   202  → LicensePending   (webhook has not landed yet; caller retries)
//   404  → the server knows nothing about this transaction

import { z } from 'zod';
import { SubscriptionTier } from '../domain/subscription.js';

/** Route for the retrieval endpoint, relative to the API base URL. */
export const LICENSE_BY_TRANSACTION_PATH = '/api/v1/license/by-transaction';

export const LicenseByTransactionRequestSchema = z.object({
  /** Paddle transaction id, e.g. `txn_01hv…`. Delivered as `_ptxn` on the success URL. */
  transactionId: z.string().min(1),
});

export type LicenseByTransactionRequestParsed = z.infer<typeof LicenseByTransactionRequestSchema>;

/** The purchase produced a key and the key is this. */
export const LicenseIssuedSchema = z.object({
  status: z.literal('issued'),
  licenseKey: z.string().min(1),
  tier: z.nativeEnum(SubscriptionTier),
  /** ISO-8601 instant the key was minted. */
  issuedAt: z.string().datetime(),
});

export type LicenseIssuedParsed = z.infer<typeof LicenseIssuedSchema>;

/**
 * The transaction is known but no key exists yet — Paddle's webhook is
 * asynchronous and can trail the browser redirect by seconds.
 */
export const LicensePendingSchema = z.object({
  status: z.literal('pending'),
  /** How long the caller should wait before asking again. */
  retryAfterMs: z.number().int().positive(),
});

export type LicensePendingParsed = z.infer<typeof LicensePendingSchema>;

export const LicenseByTransactionResponseSchema = z.discriminatedUnion('status', [
  LicenseIssuedSchema,
  LicensePendingSchema,
]);

export type LicenseByTransactionResponseParsed = z.infer<typeof LicenseByTransactionResponseSchema>;
