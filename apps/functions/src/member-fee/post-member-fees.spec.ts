import { describe, expect, it } from 'vitest';

import { unbookablePositions } from './post-member-fees';
import type { MemberFeePosition } from '@okr/shared-models';

const position = (overrides: Partial<MemberFeePosition> = {}): MemberFeePosition => ({
  key: 'jb', usage: 'membershipFee', type: 'fix', label: 'Jahresbeitrag',
  amount: 320, accountKey: 'acc1', vatCodeKey: 'v1', ...overrides,
});

describe('unbookablePositions', () => {
  it('passes a fee whose positions all carry a revenue account', () => {
    expect(unbookablePositions({ positions: [position(), position({ key: 'locker', accountKey: 'acc2' })] })).toEqual([]);
  });

  it('names every position without an accountKey — the shape the migration writes', () => {
    expect(unbookablePositions({ positions: [
      position(),
      position({ key: 'locker', label: 'Kästchen', accountKey: '' }),
      position({ key: 'bev', label: 'Getränke', accountKey: '   ' }),
    ] })).toEqual(['Kästchen', 'Getränke']);
  });

  it('falls back to the key when a position has no label', () => {
    expect(unbookablePositions({ positions: [position({ key: 'srv', label: '', accountKey: '' })] })).toEqual(['srv']);
  });

  it('treats a fee without positions as bookable (it simply produces an empty invoice)', () => {
    expect(unbookablePositions({ positions: [] })).toEqual([]);
  });
});
