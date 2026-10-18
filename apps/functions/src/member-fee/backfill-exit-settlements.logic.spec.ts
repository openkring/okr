import { describe, expect, it } from 'vitest';

import { selectBackfillMemberships } from './backfill-exit-settlements.logic';

describe('selectBackfillMemberships', () => {
  const today = '20261018';
  const m = (okey: string, dateOfExit: string, extra: object = {}) => ({ okey, tenants: ['scs'], dateOfExit, ...extra });

  it('keeps this year exits before the year end', () => {
    expect(selectBackfillMemberships([m('a', '20260630'), m('b', '20261017')], 'scs', today)).toEqual(['a', 'b']);
  });
  it('drops year-end, open, other-year, malformed and archived exits', () => {
    const list = [m('a', '20261231'), m('b', ''), m('c', '99991231'), m('d', '20250630'), m('e', '2026'), m('f', '20260630', { isArchived: true })];
    expect(selectBackfillMemberships(list, 'scs', today)).toEqual([]);
  });
  it('drops memberships of other tenants', () => {
    expect(selectBackfillMemberships([m('a', '20260630', { tenants: ['gss'] }), { okey: 'b', dateOfExit: '20260630' }], 'scs', today)).toEqual([]);
  });
});
