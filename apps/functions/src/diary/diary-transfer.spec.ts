import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';

const mocks = vi.hoisted(() => ({ resolveDiaryPulls: vi.fn(), appendToDiary: vi.fn() }));
vi.mock('./diary-pull', () => ({ resolveDiaryPulls: mocks.resolveDiaryPulls }));
vi.mock('./append-to-diary', () => ({ appendToDiary: mocks.appendToDiary }));

import { sendToDiaries, summariseDiaryResults } from './diary-transfer';

describe('summariseDiaryResults', () => {
  it('no target at all', () => expect(summariseDiaryResults({})).toBe('skipped-no-target'));
  it('written wins', () => expect(summariseDiaryResults({ bka: 'skipped-final', jp: 'written' })).toBe('written'));
  it('all final', () => expect(summariseDiaryResults({ bka: 'skipped-final' })).toBe('skipped-final'));
  it('no consent anywhere counts as no target', () =>
    expect(summariseDiaryResults({ bka: 'skipped-no-consent' })).toBe('skipped-no-target'));
  it('missing on remove', () => expect(summariseDiaryResults({ bka: 'skipped-missing' })).toBe('skipped-missing'));
});

describe('sendToDiaries', () => {
  const db = {} as Firestore;
  const args = { personKey: 'p', sourceTenant: 'scs', source: 'taskDone', date: '20261104', field: 'done', line: 'L' } as const;

  beforeEach(() => {
    mocks.resolveDiaryPulls.mockReset();
    mocks.appendToDiary.mockReset();
    mocks.appendToDiary.mockResolvedValue('written');
  });

  it('writes as the user in the diary tenant', async () => {
    mocks.resolveDiaryPulls.mockResolvedValue([{ tenantId: 'bka', uid: 'uBka', status: 'ok' }]);
    expect(await sendToDiaries(db, { ...args, mode: 'add' })).toEqual({ bka: 'written' });
    expect(mocks.appendToDiary).toHaveBeenCalledWith(db, 'bka', 'uBka', '20261104', 'done', 'L', 'add');
    expect(mocks.resolveDiaryPulls).toHaveBeenCalledWith(db, { personKey: 'p', sourceTenant: 'scs', source: 'taskDone', date: '20261104' });
  });
  it('writes nothing without a consent', async () => {
    mocks.resolveDiaryPulls.mockResolvedValue([{ tenantId: 'bka', uid: 'uBka', status: 'skipped-no-consent' }]);
    expect(await sendToDiaries(db, { ...args, mode: 'add' })).toEqual({ bka: 'skipped-no-consent' });
    expect(mocks.appendToDiary).not.toHaveBeenCalled();
  });
  it('leaves the line of a task reopened after the consent was revoked', async () => {
    mocks.resolveDiaryPulls.mockResolvedValue([{ tenantId: 'bka', uid: 'uBka', status: 'skipped-no-consent' }]);
    await sendToDiaries(db, { ...args, mode: 'remove' });
    expect(mocks.appendToDiary).not.toHaveBeenCalled();
  });
  it('asks nothing without a person', async () => {
    expect(await sendToDiaries(db, { ...args, personKey: '', mode: 'add' })).toEqual({});
    expect(mocks.resolveDiaryPulls).not.toHaveBeenCalled();
  });
});
