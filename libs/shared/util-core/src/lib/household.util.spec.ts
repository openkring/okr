import { HouseholdModel } from '@okr/shared-models';
import {
  householdRecipientKey,
  householdShapeError,
  householdWriteRefusal,
  isHouseholdRecipient,
  readBundle,
  removeHouseholdMember,
  shouldArchiveHousehold,
} from './household.util';

function make(over: Partial<HouseholdModel> = {}): HouseholdModel {
  const h = new HouseholdModel('scs');
  h.okey = 'h1';
  h.name = 'Familie Muster';
  h.memberKeys = ['a', 'b', 'c'];
  h.payerKey = 'a';
  h.contactKey = 'b';
  return Object.assign(h, over);
}

describe('household.util', () => {
  it('readBundle defaults missing fields', () => {
    expect(readBundle({})).toEqual({ post: true, email: false, inApp: false });
    expect(readBundle({ bundle: { post: false, email: true, inApp: false } })).toEqual({ post: false, email: true, inApp: false });
    expect(readBundle({ bundle: { email: true } as never })).toEqual({ post: true, email: true, inApp: false });
  });

  it('recipient key round trip', () => {
    expect(householdRecipientKey('x')).toBe('household.x');
    expect(isHouseholdRecipient('household.x')).toBe(true);
    expect(isHouseholdRecipient('person.x')).toBe(false);
  });

  describe('removeHouseholdMember', () => {
    it('resets payer and contact to the first remaining member', () => {
      const h = make({ payerKey: 'a', contactKey: 'a' });
      const r = removeHouseholdMember(h, 'a');
      expect(r.memberKeys).toEqual(['b', 'c']);
      expect(r.payerKey).toBe('b');
      expect(r.contactKey).toBe('b');
      expect(h.memberKeys).toEqual(['a', 'b', 'c']);
    });
    it('keeps payer and contact that are not removed', () => {
      const r = removeHouseholdMember(make(), 'c');
      expect(r.payerKey).toBe('a');
      expect(r.contactKey).toBe('b');
    });
    it('empties keys when the last member goes', () => {
      const r = removeHouseholdMember(make({ memberKeys: ['a'], payerKey: 'a', contactKey: 'a' }), 'a');
      expect(r.payerKey).toBe('');
      expect(r.contactKey).toBe('');
    });
  });

  it('shouldArchiveHousehold', () => {
    expect(shouldArchiveHousehold(make({ memberKeys: ['a'] }))).toBe(true);
    expect(shouldArchiveHousehold(make({ memberKeys: ['a', 'b'] }))).toBe(false);
  });

  describe('householdShapeError', () => {
    it('valid -> undefined', () => expect(householdShapeError(make(), [])).toBeUndefined());
    it('no-name', () => expect(householdShapeError(make({ name: '  ' }), [])).toBe('no-name'));
    it('payer-not-member', () => expect(householdShapeError(make({ payerKey: 'z' }), [])).toBe('payer-not-member'));
    it('empty payer allowed', () => expect(householdShapeError(make({ payerKey: '' }), [])).toBeUndefined());
    it('contact-not-member', () => expect(householdShapeError(make({ contactKey: 'z' }), [])).toBe('contact-not-member'));
    it('duplicate-member', () => expect(householdShapeError(make({ memberKeys: ['a', 'a'] }), [])).toBe('duplicate-member'));
    it('already-in-household', () => {
      const other = make({ okey: 'h2', memberKeys: ['c', 'x'] });
      expect(householdShapeError(make(), [other])).toBe('already-in-household');
    });
    it('ignores its own okey in others', () => {
      expect(householdShapeError(make(), [make()])).toBeUndefined();
    });
    it('bad-tenants', () => {
      expect(householdShapeError(make({ tenants: [] }), [])).toBe('bad-tenants');
      expect(householdShapeError(make({ tenants: ['a', 'b'] }), [])).toBe('bad-tenants');
    });
  });

  describe('householdWriteRefusal', () => {
    const admin = { personKey: 'adm', isAdmin: true };
    const member = { personKey: 'a', isAdmin: false };
    it('admin creates', () => expect(householdWriteRefusal(admin, undefined, make())).toBeUndefined());
    it('member creates -> not-allowed', () => expect(householdWriteRefusal(member, undefined, make())).toBe('not-allowed'));
    it('non-member edits -> not-allowed', () => {
      expect(householdWriteRefusal({ personKey: 'z', isAdmin: false }, make(), make({ name: 'x' }))).toBe('not-allowed');
    });
    it('member changes bundle', () => {
      expect(householdWriteRefusal(member, make(), make({ bundle: { post: false, email: true, inApp: true } }))).toBeUndefined();
    });
    it('member adds a key', () => {
      expect(householdWriteRefusal(member, make(), make({ memberKeys: ['a', 'b', 'c', 'd'] }))).toBe('members-changed');
    });
    it('member removes only themself', () => {
      expect(householdWriteRefusal(member, make(), make({ memberKeys: ['b', 'c'] }))).toBeUndefined();
    });
    it('member removes another', () => {
      expect(householdWriteRefusal(member, make(), make({ memberKeys: ['a', 'c'] }))).toBe('members-changed');
    });
    it('member changes tenants', () => {
      expect(householdWriteRefusal(member, make(), make({ tenants: ['kring'] }))).toBe('tenants-changed');
    });
    it('admin may change members', () => {
      expect(householdWriteRefusal(admin, make(), make({ memberKeys: ['a'] }))).toBeUndefined();
    });
    it('admin changing tenants -> tenants-changed', () => {
      expect(householdWriteRefusal(admin, make(), make({ tenants: ['kring'] }))).toBe('tenants-changed');
    });
  });
});
