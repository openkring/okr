import { describe, expect, it } from 'vitest';
import { stuckBefore } from './stuck-check';

describe('stuckBefore', () => {
  it('treats rows received over one hour ago as stuck', () => {
    const now = Date.parse('2026-11-06T12:00:00.000Z');
    expect(stuckBefore(now).toMillis()).toBe(Date.parse('2026-11-06T11:00:00.000Z'));
  });
});
