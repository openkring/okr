import { describe, expect, it } from 'vitest';
import { DeliveryChannel } from '@okr/shared-models';
import { admissibleKeys, buildMailingHouseholds, chunk, contactKeysToRead, householdLookupKeys, isElevated, touchingHouseholds } from './mailing-recipients';

describe('isElevated', () => {
  it('accepts memberAdmin, privileged and admin', () => {
    expect(isElevated({ memberAdmin: true })).toBe(true);
    expect(isElevated({ privileged: true })).toBe(true);
    expect(isElevated({ admin: true })).toBe(true);
  });

  it('refuses everybody else', () => {
    expect(isElevated({ registered: true, groupAdmin: true })).toBe(false);
    expect(isElevated(undefined)).toBe(false);
  });
});

describe('admissibleKeys', () => {
  it('dedupes and drops empty keys', () => {
    expect(admissibleKeys(['a', '', 'a', 'b'])).toEqual(['a', 'b']);
  });

  it('keeps only group members for a group admin', () => {
    expect(admissibleKeys(['a', 'x', 'b'], ['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('chunk', () => {
  it('splits into slices of at most the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 30)).toEqual([]);
  });
});

describe('households of a Versand', () => {
  const doc = (okey: string, data: Record<string, unknown>) => ({ okey, data });
  const family = doc('h1', {
    tenants: ['scs'], isArchived: false, name: 'Familie Muster', memberKeys: ['mom', 'kid'], contactKey: 'mom',
    bundle: { post: true, email: false, inApp: false },
  });

  it('a requested child pulls in the household and the contact\'s channels', () => {
    const touching = touchingHouseholds([family], 'scs', ['kid']);
    expect(touching.map((h) => h.okey)).toEqual(['h1']);
    expect(contactKeysToRead(touching, ['kid'])).toEqual(['mom']);
    expect(contactKeysToRead(touching, ['kid', 'mom'])).toEqual([]);
    const households = buildMailingHouseholds(touching,
      [{ personKey: 'mom', hasAccount: false, hasEmail: true, hasPostal: true }],
      { mom: { firstName: 'Mia', lastName: 'Muster' } });
    expect(households).toEqual([{
      okey: 'h1', name: 'Familie Muster', contactKey: 'mom', contactName: 'Mia Muster', memberKeys: ['mom', 'kid'],
      bundle: { post: true, email: false, inApp: false },
      contact: { personKey: 'mom', possible: [DeliveryChannel.Email, DeliveryChannel.Post], initial: [DeliveryChannel.Email] },
    }]);
  });

  it('skips archived households, other tenants, shared tenants and households without a requested key', () => {
    const docs = [
      doc('a', { ...family.data, isArchived: true }),
      doc('b', { ...family.data, tenants: ['other'] }),
      doc('c', { ...family.data, tenants: ['scs', 'other'] }),
      doc('d', { ...family.data, memberKeys: ['x', 'y'], contactKey: 'x' }),
    ];
    expect(touchingHouseholds(docs, 'scs', ['kid'])).toEqual([]);
  });

  it('skips a household whose contact is empty or not a member', () => {
    const docs = [doc('a', { ...family.data, contactKey: '' }), doc('b', { ...family.data, contactKey: 'stranger' })];
    expect(touchingHouseholds(docs, 'scs', ['kid'])).toEqual([]);
  });

  it('reads a missing bundle as the defaults', () => {
    const [h] = touchingHouseholds([doc('h1', { ...family.data, bundle: undefined })], 'scs', ['kid']);
    expect(h.bundle).toEqual({ post: true, email: false, inApp: false });
  });

  it('leaves org keys out of the household lookup', () => {
    expect(householdLookupKeys(['org.x', 'kid'])).toEqual(['kid']);
  });
});
