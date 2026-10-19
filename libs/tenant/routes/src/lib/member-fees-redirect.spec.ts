import { describe, expect, it } from 'vitest';

import { memberFeesRedirectUrl } from './member-fees-redirect';

describe('memberFeesRedirectUrl', () => {
  it('points into the default books', () => {
    expect(memberFeesRedirectUrl('scs', 'c-memberfees')).toBe('/accounting/scs/member-fees/c-memberfees');
  });
  it('falls back to the app root without a default books', () => {
    expect(memberFeesRedirectUrl('', 'c-memberfees')).toBe('/');
    expect(memberFeesRedirectUrl(undefined, 'c-memberfees')).toBe('/');
  });
});
