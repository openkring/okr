import { describe, expect, it } from 'vitest';

import { shouldSendReceipt } from './jump.util';

describe('shouldSendReceipt', () => {
  it('sends no receipt while a jumped timeline is on screen', () => {
    expect(shouldSendReceipt(true, false)).toBe(false);
  });

  it('sends a receipt once the jumped timeline has reached the live end', () => {
    expect(shouldSendReceipt(true, true)).toBe(true);
  });

  it('sends a receipt on the live timeline', () => {
    expect(shouldSendReceipt(false, false)).toBe(true);
    expect(shouldSendReceipt(false, true)).toBe(true);
  });
});
