import { describe, expect, it } from 'vitest';
import { OwnershipModel } from '@okr/shared-models';

import { getPrivateBoatKeys } from './boat-ownership.util';

const TENANT = 'scs';

function ownership(patch: Partial<OwnershipModel>): OwnershipModel {
  return { ...new OwnershipModel(TENANT), resourceKey: 'boat1', validFrom: '20000101', validTo: '99991231', ...patch };
}

describe('getPrivateBoatKeys', () => {
  it('flags a boat owned by someone other than the club', () => {
    const keys = getPrivateBoatKeys([ownership({ ownerKey: 'person1' })], TENANT, 2026);

    expect(keys.has('boat1')).toBe(true);
  });

  it('does not flag a club boat', () => {
    const keys = getPrivateBoatKeys([ownership({ ownerKey: TENANT })], TENANT, 2026);

    expect(keys.has('boat1')).toBe(false);
  });

  it('ignores an ownership that does not cover the season', () => {
    const past = ownership({ ownerKey: 'person1', validFrom: '20100101', validTo: '20201231' });

    expect(getPrivateBoatKeys([past], TENANT, 2026).has('boat1')).toBe(false);
    expect(getPrivateBoatKeys([past], TENANT, 2015).has('boat1')).toBe(true);
  });

  it('takes the later ownership when a transfer overlaps — Nirvana, Corvus', () => {
    const member = ownership({ ownerKey: 'person1', validFrom: '20100101', validTo: '20261231' });
    const club = ownership({ ownerKey: TENANT, validFrom: '20260401', validTo: '99991231' });

    expect(getPrivateBoatKeys([member, club], TENANT, 2026).has('boat1')).toBe(false);
    expect(getPrivateBoatKeys([club, member], TENANT, 2026).has('boat1')).toBe(false);
    expect(getPrivateBoatKeys([member, club], TENANT, 2025).has('boat1')).toBe(true);
  });

  it('orders two ownerships starting the same day by the one running longer', () => {
    const ending = ownership({ ownerKey: 'person1', validFrom: '20260101', validTo: '20261231' });
    const open = ownership({ ownerKey: TENANT, validFrom: '20260101', validTo: '99991231' });

    expect(getPrivateBoatKeys([ending, open], TENANT, 2026).has('boat1')).toBe(false);
  });

  it('keeps boats apart', () => {
    const keys = getPrivateBoatKeys([
      ownership({ resourceKey: 'boat1', ownerKey: 'person1' }),
      ownership({ resourceKey: 'boat2', ownerKey: TENANT }),
    ], TENANT, 2026);

    expect([...keys]).toEqual(['boat1']);
  });
});
