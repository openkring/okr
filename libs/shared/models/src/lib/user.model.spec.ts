import { describe, expect, it } from 'vitest';
import { UserModel, withoutDiaryConsents } from './user.model';

describe('withoutDiaryConsents', () => {
  const user = Object.assign(new UserModel('scs'), { okey: 'u1', diaryConsents: [{ tenantId: 'bka', uid: 'uBka', sources: ['tracker' as const] }] });
  it('leaves the field out of the write', () => expect('diaryConsents' in withoutDiaryConsents(user)).toBe(false));
  it('keeps everything else', () => expect(withoutDiaryConsents(user).okey).toBe('u1'));
  it('leaves the given user alone', () => {
    withoutDiaryConsents(user);
    expect(user.diaryConsents).toHaveLength(1);
  });
});
