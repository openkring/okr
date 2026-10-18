import { describe, expect, it } from 'vitest';

import { effectiveUnreadCount, flaggedUnreadFrom, unreadFromEventIdOf } from './unread-from.util';

describe('effectiveUnreadCount', () => {
  it('keeps the server count when it is above zero', () => {
    expect(effectiveUnreadCount(3, '$b', ['$a', '$b', '$c'])).toBe(3);
  });

  it('counts the flagged event and everything after it', () => {
    expect(effectiveUnreadCount(0, '$b', ['$a', '$b', '$c'])).toBe(2);
  });

  it('counts at least one when the flagged event is not loaded', () => {
    expect(effectiveUnreadCount(0, '$x', ['$a'])).toBe(1);
  });

  it('is zero without a flag', () => {
    expect(effectiveUnreadCount(0, undefined, ['$a'])).toBe(0);
  });
});

describe('unreadFromEventIdOf', () => {
  it('reads the event id from the account data content', () => {
    expect(unreadFromEventIdOf({ eventId: '$a', ts: 1 })).toBe('$a');
  });

  it('is undefined for a cleared or malformed flag', () => {
    expect(unreadFromEventIdOf({})).toBeUndefined();
    expect(unreadFromEventIdOf({ eventId: '' })).toBeUndefined();
    expect(unreadFromEventIdOf({ eventId: 42 })).toBeUndefined();
    expect(unreadFromEventIdOf(undefined)).toBeUndefined();
  });
});

describe('flaggedUnreadFrom', () => {
  it('is the flagged event while m.marked_unread is set', () => {
    expect(flaggedUnreadFrom({ eventId: '$a', ts: 1 }, { unread: true })).toBe('$a');
  });

  it('is undefined once another client cleared m.marked_unread', () => {
    expect(flaggedUnreadFrom({ eventId: '$a', ts: 1 }, { unread: false })).toBeUndefined();
    expect(flaggedUnreadFrom({ eventId: '$a', ts: 1 }, undefined)).toBeUndefined();
    expect(flaggedUnreadFrom({ eventId: '$a', ts: 1 }, {})).toBeUndefined();
  });

  it('is undefined without the okr flag', () => {
    expect(flaggedUnreadFrom({}, { unread: true })).toBeUndefined();
    expect(flaggedUnreadFrom(undefined, { unread: true })).toBeUndefined();
  });
});
