import { describe, expect, it } from '@jest/globals';
import * as usage from '../../../src/utils/telemetry/usage';

describe('public telemetry surface', () => {
  it('exports only inert tracking and redaction helpers', () => {
    expect(usage.usageTracker.isInitialized()).toBe(false);
    expect(usage.hashUrlSync('https://example.com/article?private=1')).toBe(
      usage.hashUrlSync('https://example.com/article?private=2'),
    );
    expect(usage).not.toHaveProperty('installConsoleCapture');
    expect(usage).not.toHaveProperty('installErrorCapture');
  });
});
