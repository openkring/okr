import { describe, expect, it } from 'vitest';
import { PartnerModel } from '@okr/shared-models';
import { getPartnerIndex, isPartner, isPartnerOperational, PARTNER_STATUSES } from './partner.util';

const partner = (over: Partial<PartnerModel> = {}): PartnerModel =>
  Object.assign(new PartnerModel('kring'), { okey: 'partnerA', name: 'Muster IT GmbH' }, over);

describe('isPartner', () => {
  it('accepts a partner document', () => {
    expect(isPartner(partner(), 'kring')).toBe(true);
  });

  // isType compares typeof only (see the guard's doc comment) — it rejects nullish and
  // primitives, not a wrongly-shaped object. Assert what it actually does, not what the name
  // suggests, so nobody later "fixes" a passing test into a false guarantee.
  it('rejects nullish and primitive values', () => {
    expect(isPartner(undefined, 'kring')).toBe(false);
    expect(isPartner('partnerA', 'kring')).toBe(false);
    expect(isPartner(0, 'kring')).toBe(false);
  });
});

describe('getPartnerIndex', () => {
  it('indexes name, status and org', () => {
    const index = getPartnerIndex(partner({ status: 'active', orgKey: 'org1' }));
    expect(index).toBe('name:Muster IT GmbH status:active org:org1');
  });

  it('never indexes the service uid — it is credential-like', () => {
    expect(getPartnerIndex(partner({ serviceUid: 'uid-secret' }))).not.toContain('uid-secret');
  });

  it('omits an empty element instead of leaving a dangling key', () => {
    expect(getPartnerIndex(partner({ orgKey: '' }))).toBe('name:Muster IT GmbH status:prospect');
  });
});

describe('isPartnerOperational', () => {
  it('is true only for an active, unarchived partner', () => {
    expect(isPartnerOperational(partner({ status: 'active' }))).toBe(true);
    expect(isPartnerOperational(partner({ status: 'suspended' }))).toBe(false);
    expect(isPartnerOperational(partner({ status: 'active', isArchived: true }))).toBe(false);
  });

  it('lists the four statuses in lifecycle order', () => {
    expect(PARTNER_STATUSES).toEqual(['prospect', 'active', 'suspended', 'terminated']);
  });
});
