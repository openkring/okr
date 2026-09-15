import { describe, expect, it } from 'vitest';

import { resetActivity, seenKeyFor, toSeenCounts, unseenActivity } from './calevent-activity.util';

describe('unseenActivity', () => {
  it('is the difference between the event counter and the seen marker', () => {
    expect(unseenActivity({ okey: 'e1', activityCount: 5 }, { 'calevent.e1': 3 })).toBe(2);
  });

  it('is the full count when the user never opened the event', () => {
    expect(unseenActivity({ okey: 'e1', activityCount: 2 }, {})).toBe(2);
  });

  it('is 0 for a legacy event without a counter', () => {
    expect(unseenActivity({ okey: 'e1', activityCount: undefined as unknown as number }, {})).toBe(0);
  });

  it('never goes negative when the marker is ahead of the counter', () => {
    expect(unseenActivity({ okey: 'e1', activityCount: 1 }, { 'calevent.e1': 4 })).toBe(0);
  });

  it('ignores markers of other events', () => {
    expect(unseenActivity({ okey: 'e1', activityCount: 1 }, { 'calevent.e2': 1 })).toBe(1);
  });
});

describe('toSeenCounts', () => {
  it('maps marker id to count, tolerating a legacy marker without count', () => {
    expect(toSeenCounts([
      { okey: 'calevent.e1', count: 2, seenAt: '' },
      { okey: 'calevent.e2', count: undefined as unknown as number, seenAt: '' },
    ])).toEqual({ 'calevent.e1': 2, 'calevent.e2': 0 });
  });
});

describe('seenKeyFor', () => {
  it('uses the comment parentKey shape', () => {
    expect(seenKeyFor('abc')).toBe('calevent.abc');
  });
});

describe('resetActivity', () => {
  it('clears both fields so a copied event does not inherit a badge', () => {
    const original = { activityCount: 7, lastActivityAt: '20260915120000' };
    expect({ ...original, ...resetActivity() }).toEqual({ activityCount: 0, lastActivityAt: '' });
  });
});
