import { describe, expect, it } from 'vitest';

import { toPositions } from './migrate-member-fees';

describe('toPositions', () => {
  it('drops zero columns and keeps the rest', () => {
    expect(toPositions({ jb: 320, srv: 0, bev: 0, locker: 20 })).toEqual([
      { key: 'jb', usage: 'membershipFee', type: 'fix', label: 'Jahresbeitrag', amount: 320, accountKey: '', vatCodeKey: '' },
      { key: 'locker', usage: 'lockerRental', type: 'fix', label: 'Kästchen', amount: 20, accountKey: '', vatCodeKey: '' },
    ]);
  });

  it('turns a rebate into a rebate position carrying its reason as the label', () => {
    const positions = toPositions({ jb: 320, rebate: 50, rebateReason: 'Ehrenmitglied' });
    expect(positions.at(-1)).toMatchObject({ type: 'rebate', label: 'Ehrenmitglied', amount: 50 });
  });

  it('returns nothing for an all-zero legacy document', () => {
    expect(toPositions({ jb: 0, srv: 0 })).toEqual([]);
  });

  it('keeps a rebate reason even when the amount is zero', () => {
    const positions = toPositions({ jb: 600, rebate: 0, rebateReason: 'custom' });
    expect(positions.at(-1)).toMatchObject({ type: 'rebate', label: 'custom', amount: 0 });
  });
});
