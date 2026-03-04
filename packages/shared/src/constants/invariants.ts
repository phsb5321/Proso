// Business invariants — non-negotiable rules enforced across extension and server
// From spec.md §Business Invariants

export const BUSINESS_INVARIANTS = {
  /** INV-001: Free tier never requires account creation */
  'INV-001': {
    id: 'INV-001',
    rule: 'Free tier never requires account creation',
    enforcement: 'License validation returns default free tier for unknown keys',
  },

  /** INV-002: BYOK always available on all tiers */
  'INV-002': {
    id: 'INV-002',
    rule: 'BYOK always available on all tiers',
    enforcement:
      'BYOK keys forwarded to server for single-request use; never persisted server-side',
  },

  /** INV-003: Word-level sync always free */
  'INV-003': {
    id: 'INV-003',
    rule: 'Word-level sync always free',
    enforcement: 'No server involvement — handled entirely client-side',
  },

  /** INV-004: No credit expiration mid-billing cycle */
  'INV-004': {
    id: 'INV-004',
    rule: 'No credit expiration mid-billing cycle',
    enforcement: 'Credit service checks billing period boundaries',
  },

  /** INV-005: Browser TTS always unlimited */
  'INV-005': {
    id: 'INV-005',
    rule: 'Browser TTS always unlimited',
    enforcement: 'No server involvement — client-side only',
  },

  /** INV-006: Cached content never re-charges */
  'INV-006': {
    id: 'INV-006',
    rule: 'Cached content never re-charges',
    enforcement: 'Cache lookup before credit deduction in TTS flow',
  },
} as const;

export type InvariantId = keyof typeof BUSINESS_INVARIANTS;
