import { describe, expect, it } from 'vitest';
import { DiaryModel } from '@okr/shared-models';
import { diaryValidations } from './diary.validations';

function run(patch: Partial<DiaryModel>) {
  const model: DiaryModel = { ...new DiaryModel('t1'), okey: 't1__u1__20220306', authorKey: 'u1', date: '20220306', ...patch };
  return diaryValidations(model, 't1', 'diary');
}

describe('diaryValidations', () => {
  it('accepts a plain day entry', () => expect(run({}).hasErrors()).toBe(false));
  it('rejects a day scope with a zeroed date', () => expect(run({ date: '20220300' }).hasErrors('date')).toBe(true));
  it('accepts a month aggregate', () => expect(run({ scope: 'month', date: '20041000' }).hasErrors('date')).toBe(false));
  it('rejects a month aggregate carrying a day', () => expect(run({ scope: 'month', date: '20041001' }).hasErrors('date')).toBe(true));
  it('rejects an empty author', () => expect(run({ authorKey: '' }).hasErrors('authorKey')).toBe(true));
  it('rejects an unknown status', () => expect(run({ status: 'active' as never }).hasErrors('status')).toBe(true));
  it('limits the title', () => expect(run({ title: 'x'.repeat(101) }).hasErrors('title')).toBe(true));
});
