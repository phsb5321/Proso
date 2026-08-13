import { createHmac } from 'node:crypto';
import { verifyPaddleWebhook } from '../../../../src/adapters/billing/paddle.adapter';

const SECRET = 'paddle-endpoint-secret-for-tests';
const NOW_MS = 1_800_000_000_000;
const EVENT = {
  event_id: 'evt_01signature0000000000000000',
  event_type: 'transaction.completed',
  occurred_at: '2027-01-15T08:00:00.000Z',
  data: { id: 'txn_01signature0000000000000000' },
};

function rawEvent(event: unknown = EVENT): Buffer {
  return Buffer.from(JSON.stringify(event));
}

function h1(rawBody: Buffer, timestamp = Math.floor(NOW_MS / 1_000)): string {
  return createHmac('sha256', SECRET).update(`${timestamp}:`).update(rawBody).digest('hex');
}

function signature(rawBody: Buffer, timestamp = Math.floor(NOW_MS / 1_000)): string {
  return `ts=${timestamp};h1=${h1(rawBody, timestamp)}`;
}

describe('verifyPaddleWebhook', () => {
  it('authenticates the exact raw bytes before returning the parsed envelope', () => {
    const rawBody = rawEvent();

    const result = verifyPaddleWebhook(rawBody, signature(rawBody), SECRET, NOW_MS);

    expect(result).toMatchObject({
      eventId: EVENT.event_id,
      eventType: EVENT.event_type,
      data: EVENT.data,
    });
    expect(result.occurredAt.toISOString()).toBe(EVENT.occurred_at);
  });

  it('rejects a one-byte body mutation after signing', () => {
    const signed = rawEvent();
    const mutated = Buffer.from(signed);
    mutated[mutated.length - 2] ^= 1;

    expect(() => verifyPaddleWebhook(mutated, signature(signed), SECRET, NOW_MS)).toThrow();
  });

  it('rejects timestamps outside the five-second tolerance in either direction', () => {
    const rawBody = rawEvent();
    const oldTimestamp = Math.floor((NOW_MS - 6_000) / 1_000);
    const futureTimestamp = Math.floor((NOW_MS + 6_000) / 1_000);

    expect(() =>
      verifyPaddleWebhook(rawBody, signature(rawBody, oldTimestamp), SECRET, NOW_MS),
    ).toThrow();
    expect(() =>
      verifyPaddleWebhook(rawBody, signature(rawBody, futureTimestamp), SECRET, NOW_MS),
    ).toThrow();
  });

  it('accepts a valid rotated second h1 value', () => {
    const rawBody = rawEvent();
    const timestamp = Math.floor(NOW_MS / 1_000);
    const header = `ts=${timestamp};h1=${'0'.repeat(64)};h1=${h1(rawBody, timestamp)}`;

    expect(verifyPaddleWebhook(rawBody, header, SECRET, NOW_MS).eventId).toBe(EVENT.event_id);
  });

  it.each([
    '',
    'h1=' + '0'.repeat(64),
    'ts=not-a-number;h1=' + '0'.repeat(64),
    `ts=${Math.floor(NOW_MS / 1_000)};h1=abcd`,
    `ts=${Math.floor(NOW_MS / 1_000)};ts=${Math.floor(NOW_MS / 1_000)};h1=${'0'.repeat(64)}`,
  ])('rejects a malformed signature header: %s', (header) => {
    expect(() => verifyPaddleWebhook(rawEvent(), header, SECRET, NOW_MS)).toThrow();
  });

  it('does not parse malformed JSON until after a valid signature is proven', () => {
    const malformed = Buffer.from('{"event_id":');

    expect(() => verifyPaddleWebhook(malformed, signature(malformed), SECRET, NOW_MS)).toThrow(
      'JSON',
    );
    expect(() =>
      verifyPaddleWebhook(
        malformed,
        `ts=${Math.floor(NOW_MS / 1_000)};h1=${'0'.repeat(64)}`,
        SECRET,
        NOW_MS,
      ),
    ).toThrow('signature');
  });

  it('rejects a signed envelope with missing or invalid required fields', () => {
    for (const event of [
      { ...EVENT, event_id: '' },
      { ...EVENT, occurred_at: 'not-a-date' },
      { ...EVENT, data: [] },
    ]) {
      const rawBody = rawEvent(event);
      expect(() => verifyPaddleWebhook(rawBody, signature(rawBody), SECRET, NOW_MS)).toThrow();
    }
  });
});
