import { describe, expect, it } from 'vitest';
import { pickDiaryAuthor, summariseDiaryResults } from './diary-transfer';

describe('pickDiaryAuthor', () => {
  const users = [
    { id: 'u-scs', tenants: ['scs'] },
    { id: 'u-old', tenants: ['bka'], isArchived: true },
    { id: 'u-bka', tenants: ['bka'] },
  ];
  it('picks the active user in the diary tenant', () => expect(pickDiaryAuthor(users, 'bka')).toBe('u-bka'));
  it('never picks an archived user', () => expect(pickDiaryAuthor([users[1]], 'bka')).toBeUndefined());
  it('returns undefined without a user in that tenant', () => expect(pickDiaryAuthor(users, 'jp')).toBeUndefined());
  it('tolerates a user doc without tenants', () => expect(pickDiaryAuthor([{ id: 'x' }], 'bka')).toBeUndefined());
});

describe('summariseDiaryResults', () => {
  it('no target at all', () => expect(summariseDiaryResults({})).toBe('skipped-no-target'));
  it('written wins', () => expect(summariseDiaryResults({ bka: 'skipped-final', jp: 'written' })).toBe('written'));
  it('all final', () => expect(summariseDiaryResults({ bka: 'skipped-final' })).toBe('skipped-final'));
  it('no user anywhere counts as no target', () =>
    expect(summariseDiaryResults({ bka: 'skipped-no-user' })).toBe('skipped-no-target'));
  it('missing on remove', () => expect(summariseDiaryResults({ bka: 'skipped-missing' })).toBe('skipped-missing'));
});
