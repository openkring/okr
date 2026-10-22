import { describe, expect, it } from 'vitest';
import { DiaryTarget } from '@okr/shared-models';
import { offeredDiarySources, resolveDiaryTargets } from './diary-transfer.util';

const t = (tenantId: string, sources: DiaryTarget['sources'], from = '', to = ''): DiaryTarget =>
  ({ tenantId, sources, from, to });

describe('resolveDiaryTargets', () => {
  it('returns nothing for a legacy user without targets', () =>
    expect(resolveDiaryTargets(undefined, 'jasstafel', '20261005')).toEqual([]));
  it('returns nothing when the source is not ticked', () =>
    expect(resolveDiaryTargets([t('bka', ['taskDone'])], 'jasstafel', '20261005')).toEqual([]));
  it('matches an open column', () =>
    expect(resolveDiaryTargets([t('bka', ['jasstafel'])], 'jasstafel', '20261005')).toEqual(['bka']));
  it('includes both bounds', () => {
    const targets = [t('jp', ['jasstafel'], '20261001', '20261020')];
    expect(resolveDiaryTargets(targets, 'jasstafel', '20261001')).toEqual(['jp']);
    expect(resolveDiaryTargets(targets, 'jasstafel', '20261020')).toEqual(['jp']);
    expect(resolveDiaryTargets(targets, 'jasstafel', '20260930')).toEqual([]);
    expect(resolveDiaryTargets(targets, 'jasstafel', '20261021')).toEqual([]);
  });
  it('treats an empty bound as open', () =>
    expect(resolveDiaryTargets([t('d1', ['taskDone'], '', '')], 'taskDone', '20261022')).toEqual(['d1']));
  it('lets a half-open range bound only its typed side', () => {
    const targets = [t('jp', ['taskDone'], '', '20261025')];
    expect(resolveDiaryTargets(targets, 'taskDone', '20261024')).toEqual(['jp']);
    expect(resolveDiaryTargets(targets, 'taskDone', '20261026')).toEqual([]);
  });
  it('returns several diaries, de-duplicated, in stored order', () => {
    const targets = [t('bka', ['jasstafel']), t('jp', ['jasstafel']), t('bka', ['jasstafel'])];
    expect(resolveDiaryTargets(targets, 'jasstafel', '20261005')).toEqual(['bka', 'jp']);
  });
  it('ignores a target with an empty tenant id', () =>
    expect(resolveDiaryTargets([t('', ['jasstafel'])], 'jasstafel', '20261005')).toEqual([]));
});

describe('offeredDiarySources', () => {
  it('offers only implemented sources whose block is effective', () => {
    expect(offeredDiarySources(new Set(['task', 'jasstafel', 'trip']))).toEqual(['taskDone', 'jasstafel']);
    expect(offeredDiarySources(new Set(['cms']))).toEqual([]);
  });
});
