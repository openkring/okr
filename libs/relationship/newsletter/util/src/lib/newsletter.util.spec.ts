import { describe, expect, it } from 'vitest';
import { AVATAR_INFO_SHAPE, AvatarInfo, GroupModel, NewsletterSubscriptionModel, UserModel } from '@okr/shared-models';

import { activeSubscribers, canSeeSubscribers, isActiveSubscription, mayPostNewsletter, newsletterGroups } from './newsletter.util';

function sub(fields: Partial<NewsletterSubscriptionModel> = {}): NewsletterSubscriptionModel {
  return { ...new NewsletterSubscriptionModel('scs'), okey: 's1', personKey: 'p1', personName: 'Anna Muster', groupKey: 'n1', dateOfEntry: '20260101', ...fields };
}
function group(fields: Partial<GroupModel> = {}): GroupModel {
  return { ...new GroupModel('scs'), okey: 'n1', kind: 'newsletter', ...fields } as GroupModel;
}
function user(roles: object = {}, personKey = 'p9'): UserModel {
  return { ...new UserModel('scs'), personKey, roles } as UserModel;
}
const adminAvatar = (key: string): AvatarInfo => ({ ...AVATAR_INFO_SHAPE, key, modelType: 'person' });

describe('isActiveSubscription', () => {
  it('is active while dateOfExit is empty', () => {
    expect(isActiveSubscription(sub())).toBe(true);
  });
  it('is ended by any exit date, past or future (like the server)', () => {
    expect(isActiveSubscription(sub({ dateOfExit: '20261001' }))).toBe(false);
    expect(isActiveSubscription(sub({ dateOfExit: '20991231' }))).toBe(false);
  });
  it('is never active when archived', () => {
    expect(isActiveSubscription(sub({ isArchived: true }))).toBe(false);
  });
  it('reads a missing dateOfExit as still subscribed', () => {
    expect(isActiveSubscription(sub({ dateOfExit: undefined as unknown as string }))).toBe(true);
  });
});

describe('activeSubscribers', () => {
  it('keeps the active ones, sorted by name', () => {
    const list = [
      sub({ okey: 'a', personName: 'Zora Zett' }),
      sub({ okey: 'b', personName: 'Anna Alt', dateOfExit: '20260301' }),
      sub({ okey: 'c', personName: 'Beat Berg' }),
    ];
    expect(activeSubscribers(list).map(s => s.okey)).toEqual(['c', 'a']);
  });
});

describe('newsletterGroups', () => {
  it('keeps the live newsletter groups only', () => {
    const groups = [
      group({ okey: 'n1' }),
      group({ okey: 'n2', isArchived: true }),
      group({ okey: 'g1', kind: 'group' }),
      group({ okey: 'g2', kind: undefined as unknown as GroupModel['kind'] }),
      group({ okey: 'p1', kind: 'pinboard' }),
    ];
    expect(newsletterGroups(groups).map(g => g.okey)).toEqual(['n1']);
  });
});

describe('canSeeSubscribers', () => {
  it('lets member admins, privileged users and admins see them', () => {
    expect(canSeeSubscribers(group(), user({ memberAdmin: true }))).toBe(true);
    expect(canSeeSubscribers(group(), user({ privileged: true }))).toBe(true);
    expect(canSeeSubscribers(group(), user({ admin: true }))).toBe(true);
  });
  it('lets an admin of the newsletter see them', () => {
    expect(canSeeSubscribers(group({ admins: [adminAvatar('p9')] }), user({ registered: true }))).toBe(true);
  });
  it('keeps a plain member out', () => {
    expect(canSeeSubscribers(group({ admins: [adminAvatar('p1')] }), user({ registered: true }))).toBe(false);
  });
  it('keeps everybody out without a user or a group', () => {
    expect(canSeeSubscribers(group(), undefined)).toBe(false);
    expect(canSeeSubscribers(undefined, user({ admin: true }))).toBe(false);
  });
});

describe('mayPostNewsletter', () => {
  it('lets the elevated roles send letters', () => {
    expect(mayPostNewsletter(user({ memberAdmin: true }))).toBe(true);
    expect(mayPostNewsletter(user({ privileged: true }))).toBe(true);
    expect(mayPostNewsletter(user({ admin: true }))).toBe(true);
  });
  it('keeps a newsletter admin without such a role from sending letters', () => {
    expect(mayPostNewsletter(user({ registered: true }))).toBe(false);
    expect(mayPostNewsletter(undefined)).toBe(false);
  });
});
