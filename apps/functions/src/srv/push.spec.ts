import { describe, expect, it } from 'vitest';

import { buildPushData } from './push';

describe('buildPushData', () => {
  const base = { type: 'calevent', title: 'Training', body: 'Faellt aus', url: '/calevent/e1' };

  it('carries the routing fields', () => {
    expect(buildPushData(base)).toEqual({
      type: 'calevent', title: 'Training', body: 'Faellt aus', url: '/calevent/e1',
    });
  });

  it('OMITS badgeCount when the sender passes none — the badge is absolute and has two other writers', () => {
    expect(buildPushData(base)['badgeCount']).toBeUndefined();
  });

  it('writes badgeCount as a string when the sender knows the total', () => {
    expect(buildPushData({ ...base, badgeCount: 3 })['badgeCount']).toBe('3');
  });

  it('keeps a badgeCount of 0 — it is what clears the badge', () => {
    expect(buildPushData({ ...base, badgeCount: 0 })['badgeCount']).toBe('0');
  });

  it('carries channelId so several pushes about one event collapse into one banner', () => {
    expect(buildPushData({ ...base, channelId: 'calevent.e1' })['channelId']).toBe('calevent.e1');
  });

  it('omits channelId when empty rather than sending a blank tag', () => {
    expect(buildPushData({ ...base, channelId: '' })['channelId']).toBeUndefined();
  });
});
