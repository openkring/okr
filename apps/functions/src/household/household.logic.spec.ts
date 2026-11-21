import { HouseholdModel } from '@okr/shared-models';
import { coerceBundle, decideArchive, householdAfterErasure, prepareHouseholdWrite } from './household.logic';

function household(members: string[], over: Partial<HouseholdModel> = {}): HouseholdModel {
  const h = new HouseholdModel('t1');
  h.okey = 'h1';
  h.name = 'Familie Muster';
  h.memberKeys = members;
  h.payerKey = members[0] ?? '';
  h.contactKey = members[0] ?? '';
  return Object.assign(h, over);
}

describe('prepareHouseholdWrite', () => {
  it('archives when a member leaves a 2-person household', () => {
    const before = household(['a', 'b']);
    const after = household(['a'], { payerKey: 'a', contactKey: 'a' });
    expect(prepareHouseholdWrite(before, after).archive).toBe(true);
  });

  it('does not archive a household that keeps 2 members', () => {
    const before = household(['a', 'b', 'c']);
    const after = household(['a', 'b']);
    expect(prepareHouseholdWrite(before, after).archive).toBe(false);
  });

  it('moves payer and contact of a leaving member to the first remaining one', () => {
    const before = household(['a', 'b', 'c'], { payerKey: 'c', contactKey: 'c' });
    const after = household(['a', 'b'], { payerKey: 'c', contactKey: 'c' });
    const { doc } = prepareHouseholdWrite(before, after);
    expect(doc.payerKey).toBe('a');
    expect(doc.contactKey).toBe('a');
  });

  it('writes the default bundle when it is missing', () => {
    const after = household(['a', 'b']);
    delete (after as Partial<HouseholdModel>).bundle;
    expect(prepareHouseholdWrite(undefined, after).doc.bundle).toEqual({ post: true, email: false, inApp: false });
  });

  it('fills missing bundle fields from the defaults', () => {
    const after = household(['a', 'b'], { bundle: { email: true } as never });
    expect(prepareHouseholdWrite(undefined, after).doc.bundle).toEqual({ post: true, email: true, inApp: false });
  });

  it('strips okey from the stored doc', () => {
    const { doc } = prepareHouseholdWrite(undefined, household(['a', 'b']));
    expect('okey' in doc).toBe(false);
  });
});

describe('decideArchive', () => {
  const archived = household(['a', 'b'], { isArchived: true });
  it('refuses a member on an archived household', () => {
    expect(decideArchive({ isAdmin: false }, archived, false, undefined)).toBeUndefined();
  });
  it('keeps an archived household archived for an admin without flag', () => {
    expect(decideArchive({ isAdmin: true }, archived, false, undefined)).toBe(true);
  });
  it('un-archives with archive:false for an admin', () => {
    expect(decideArchive({ isAdmin: true }, archived, false, false)).toBe(false);
  });
  it('archives on admin request', () => {
    expect(decideArchive({ isAdmin: true }, household(['a', 'b']), false, true)).toBe(true);
  });
  it('archives when a member leaves (fewer than 2)', () => {
    expect(decideArchive({ isAdmin: false }, household(['a', 'b']), true, undefined)).toBe(true);
  });
  it('ignores the archive flag of a member', () => {
    expect(decideArchive({ isAdmin: false }, household(['a', 'b']), false, true)).toBe(false);
  });
});

describe('householdAfterErasure', () => {
  it('moves payer and contact to the first remaining member and archives below 2', () => {
    expect(householdAfterErasure({ memberKeys: ['a'], payerKey: 'x', contactKey: 'x' })).toEqual({ payerKey: 'a', contactKey: 'a', isArchived: true });
  });
  it('keeps valid payer/contact and an active household of 2+', () => {
    expect(householdAfterErasure({ memberKeys: ['a', 'b', 'c'], payerKey: 'b', contactKey: 'x' })).toEqual({ payerKey: 'b', contactKey: 'a' });
  });
  it('keeps an empty payer empty', () => {
    expect(householdAfterErasure({ memberKeys: ['a', 'b'], payerKey: '', contactKey: '' })).toEqual({ payerKey: '', contactKey: '' });
  });
});

describe('coerceBundle', () => {
  it('drops extra keys', () => {
    expect(coerceBundle({ post: false, email: true, inApp: true, admin: true })).toEqual({ post: false, email: true, inApp: true });
  });
  it('takes the default for a non-boolean value', () => {
    expect(coerceBundle({ post: 'false', email: 'true', inApp: 1 })).toEqual({ post: true, email: false, inApp: false });
  });
  it('takes the default for a missing key', () => {
    expect(coerceBundle({ email: true })).toEqual({ post: true, email: true, inApp: false });
  });
  it('takes all defaults for null, an array or a primitive', () => {
    for (const v of [null, undefined, [], [true], 'x', 5]) expect(coerceBundle(v)).toEqual({ post: true, email: false, inApp: false });
  });
});
