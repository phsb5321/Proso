import { describe, expect, it } from '@jest/globals';
import { defaults } from '../../../src/utils/config/defaults';
import { settingsSchema } from '../../../src/utils/config/schema';

describe('stopPlaybackOnTabChange setting', () => {
  it('defaults to enabled when existing storage has no value', () => {
    expect(defaults.stopPlaybackOnTabChange).toBe(true);
    expect(settingsSchema.parse({}).stopPlaybackOnTabChange).toBe(true);
  });

  it('preserves an explicit background-listening choice', () => {
    expect(
      settingsSchema.parse({ stopPlaybackOnTabChange: false }).stopPlaybackOnTabChange,
    ).toBe(false);
  });
});
