import { describe, expect, it } from 'vitest';
import { NoticeModel } from '@okr/shared-models';
import { noticesOfTenant } from './notice.util';

function notice(okey: string, tenant: string, sentAt: string, isArchived = false): NoticeModel {
  return { ...new NoticeModel(tenant), okey, sentAt, isArchived };
}

describe('noticesOfTenant', () => {
  const list = [
    notice('a', 'scs', '20261101100000'),
    notice('b', 'kwa', '20261105100000'),
    notice('c', 'scs', '20261107090000'),
    notice('d', 'scs', '20261106090000', true),
  ];

  it('keeps the tenant, drops archived ones, newest first', () => {
    expect(noticesOfTenant(list, 'scs').map((n) => n.okey)).toEqual(['c', 'a']);
  });

  it('cuts at maxItems, and treats 0 as no limit', () => {
    expect(noticesOfTenant(list, 'scs', 1).map((n) => n.okey)).toEqual(['c']);
    expect(noticesOfTenant(list, 'scs', 0)).toHaveLength(2);
  });
});
