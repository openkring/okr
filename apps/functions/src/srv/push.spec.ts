import { describe, expect, it } from 'vitest';

import { buildPushData, selectUserDocs, withAppName } from './push';

describe('buildPushData', () => {
  const base = { type: 'calevent', title: 'Training', body: 'Faellt aus', url: '/calevent/e1', tenantId: 'scs' };

  it('carries the routing fields', () => {
    expect(buildPushData(base)).toEqual({
      type: 'calevent', title: 'Training', body: 'Faellt aus', url: '/calevent/e1', tenantId: 'scs',
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

describe('selectUserDocs', () => {
  // Barbara (2026-09-15): one person, an scs account and a kwa account. `limit(1)` returned
  // whichever doc id sorted first — the kwa one — so every scs push went to the kwa app.
  const scs = { uid: 'cU69', tenants: ['scs'], isArchived: false };
  const kwa = { uid: 'CPhf', tenants: ['kwa'], isArchived: false };

  it('keeps only the account of the tenant the push is about', () => {
    expect(selectUserDocs([kwa, scs], 'scs')).toEqual([scs]);
  });

  it('returns NO account when the person has none in that tenant — never a foreign app', () => {
    expect(selectUserDocs([kwa], 'scs')).toEqual([]);
  });

  it('drops archived accounts', () => {
    expect(selectUserDocs([{ ...scs, isArchived: true }], 'scs')).toEqual([]);
  });

  it('tolerates a legacy account without a tenants array', () => {
    expect(selectUserDocs([{ uid: 'x', tenants: undefined, isArchived: false }], 'scs')).toEqual([]);
  });
});

describe('withAppName', () => {
  it('prefixes the title with the app name so a multi-club member sees the source', () => {
    expect(withAppName('Seeclub Stäfa', 'Breitensport')).toBe('Seeclub Stäfa · Breitensport');
  });

  it('leaves the title alone when the app name is unknown', () => {
    expect(withAppName('', 'Breitensport')).toBe('Breitensport');
  });

  it('does not double the prefix when the title already starts with it', () => {
    expect(withAppName('Seeclub Stäfa', 'Seeclub Stäfa · Breitensport')).toBe('Seeclub Stäfa · Breitensport');
  });
});

describe('buildPushData tenant', () => {
  it('carries tenantId so the service worker can refuse a foreign tenant push', () => {
    const data = buildPushData({ type: 'calevent', title: 't', body: 'b', url: '/x', tenantId: 'scs' });
    expect(data['tenantId']).toBe('scs');
  });
});
