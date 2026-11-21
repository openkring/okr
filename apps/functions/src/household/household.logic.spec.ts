import { HouseholdModel } from '@okr/shared-models';
import { prepareHouseholdWrite } from './household.logic';

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
