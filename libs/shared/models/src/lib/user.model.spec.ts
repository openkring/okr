import { describe, expect, it } from 'vitest';
import { UserModel, withoutServerFields } from './user.model';

describe('withoutServerFields', () => {
  const user = Object.assign(new UserModel('scs'), { okey: 'u1', activeTripKey: 't1', diaryConsents: [{ tenantId: 'bka', uid: 'uBka', sources: ['tracker' as const] }] });
  it('leaves the field out of the write', () => expect('diaryConsents' in withoutServerFields(user)).toBe(false));
  it('leaves activeTripKey out of the write', () => expect('activeTripKey' in withoutServerFields(user)).toBe(false));
  it('keeps everything else', () => expect(withoutServerFields(user).okey).toBe('u1'));
  it('leaves the given user alone', () => {
    withoutServerFields(user);
    expect(user.diaryConsents).toHaveLength(1);
  });
});
