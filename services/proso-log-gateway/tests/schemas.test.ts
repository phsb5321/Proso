import { describe, expect, it } from 'vitest';

import { IngestRequestSchema } from '../src/schemas.js';

const validEvent = {
  ts: '2026-07-30T18:00:00.000Z',
  event: 'playback.started',
  eventGroup: 'playback',
  level: 'info',
  msg: 'Playback started',
  entrypoint: 'background',
  extVersion: '1.1.3',
  installId: '3de9ee7d-2051-4d70-9721-f25fa19748ec',
  sessionId: 'bea7bc70-f4f0-42cf-a14c-28e54c97ecaf',
} as const;

describe('IngestRequestSchema', () => {
  it('accepts a valid telemetry batch', () => {
    const result = IngestRequestSchema.safeParse({ events: [validEvent] });

    expect(result.success).toBe(true);
  });

  it('rejects an empty telemetry batch', () => {
    const result = IngestRequestSchema.safeParse({ events: [] });

    expect(result.success).toBe(false);
  });

  it('rejects batches over the documented maximum', () => {
    const result = IngestRequestSchema.safeParse({
      events: Array.from({ length: 1001 }, () => validEvent),
    });

    expect(result.success).toBe(false);
  });
});
