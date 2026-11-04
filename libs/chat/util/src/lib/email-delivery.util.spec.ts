import { describe, expect, it } from 'vitest';

import { isEmailDeliveryOn } from './email-delivery.util';

describe('isEmailDeliveryOn', () => {
  it('is on only for enabled: true', () => {
    expect(isEmailDeliveryOn({ enabled: true })).toBe(true);
    expect(isEmailDeliveryOn({})).toBe(false);
    expect(isEmailDeliveryOn({ enabled: 'true' })).toBe(false);
    expect(isEmailDeliveryOn(undefined)).toBe(false);
  });
});
