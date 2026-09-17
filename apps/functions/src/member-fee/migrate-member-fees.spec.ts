import { describe, expect, it } from 'vitest';

import { migrateLegacyDocs, toPositions, type MigrationGateway } from './migrate-member-fees';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FsData = Record<string, any>;

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

describe('migrateLegacyDocs', () => {
  /** Two in-memory collections standing in for `scs-memberfees` and `member-fees`. */
  const gateway = (legacy: Record<string, FsData>, target: Record<string, FsData>): MigrationGateway => ({
    eachLegacy: async (fn) => {
      for (const [id, data] of Object.entries(legacy)) await fn(id, data);
      return Object.keys(legacy).length;
    },
    targetExists: async (id) => id in target,
    writeTarget: async (id, data) => { target[id] = data; },
  });

  it('copies a legacy document under the SAME id and converts its columns', async () => {
    const legacy = { 'abc123': { member: { key: 'p1' }, jb: 320, locker: 20, rebate: 0, rebateReason: '' } };
    const target: Record<string, FsData> = {};

    const result = await migrateLegacyDocs(gateway(legacy, target));

    expect(Object.keys(target)).toEqual(['abc123']);
    expect(target['abc123'].positions).toEqual([
      { key: 'jb', usage: 'membershipFee', type: 'fix', label: 'Jahresbeitrag', amount: 320, accountKey: '', vatCodeKey: '' },
      { key: 'locker', usage: 'lockerRental', type: 'fix', label: 'Kästchen', amount: 20, accountKey: '', vatCodeKey: '' },
    ]);
    expect(target['abc123'].member).toEqual({ key: 'p1' });
    // the ten legacy columns are gone from the migrated document
    expect(target['abc123']).not.toHaveProperty('jb');
    expect(target['abc123']).not.toHaveProperty('rebateReason');
    // and the legacy document is left in place for the owner to drop deliberately
    expect(legacy['abc123'].jb).toBe(320);
    expect(result).toEqual({ seen: 1, converted: 1, skipped: 0 });
  });

  it('skips a legacy document whose target already exists instead of overwriting it', async () => {
    const legacy = { 'abc123': { jb: 320 } };
    const target: Record<string, FsData> = {};

    const first = await migrateLegacyDocs(gateway(legacy, target));
    // a treasurer corrects the migrated row between the two runs
    target['abc123'].positions = [{ key: 'jb', usage: 'membershipFee', type: 'fix', label: 'Jahresbeitrag', amount: 999, accountKey: '', vatCodeKey: '' }];
    const second = await migrateLegacyDocs(gateway(legacy, target));

    expect(first).toEqual({ seen: 1, converted: 1, skipped: 0 });
    expect(second).toEqual({ seen: 1, converted: 0, skipped: 1 });
    expect(target['abc123'].positions[0].amount).toBe(999);
  });
});
