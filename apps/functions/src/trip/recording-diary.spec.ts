import { describe, expect, it } from 'vitest';
import type { TripModel } from '@okr/shared-models';

import type { PullResult } from '../diary/diary-pull';
import { diaryTenantsToAdd, shouldAttachOnWrite, sweepCandidates } from './recording-diary';

const rec = (over: Partial<TripModel> = {}, track: Partial<NonNullable<TripModel['track']>> = {}): TripModel =>
  ({ type: 'tracker', tenants: ['scs'], startDate: '20261104', track: { personKey: 'p', ...track }, ...over }) as TripModel;
const ok = (tenantId: string): PullResult => ({ tenantId, uid: `u-${tenantId}`, status: 'ok' });

describe('shouldAttachOnWrite', () => {
  it('attaches a recording when its doc is created', () => expect(shouldAttachOnWrite(undefined, rec())).toBe(true));
  it('leaves a later write alone: a rename', () => expect(shouldAttachOnWrite(rec(), rec({ name: 'renamed' }))).toBe(false));
  it('leaves a later write alone: a detach from the diary', () =>
    expect(shouldAttachOnWrite(rec({ tenants: ['scs', 'bka'] }), rec())).toBe(false));
  it('skips a crew copy', () => expect(shouldAttachOnWrite(undefined, rec({}, { copyOf: 'x' }))).toBe(false));
  it('skips other trips', () => expect(shouldAttachOnWrite(undefined, rec({ type: 'logbuch' }))).toBe(false));
  it('skips a delete', () => expect(shouldAttachOnWrite(rec(), undefined)).toBe(false));
  it('needs an owner and a tenant', () => {
    expect(shouldAttachOnWrite(undefined, rec({}, { personKey: '' }))).toBe(false);
    expect(shouldAttachOnWrite(undefined, rec({ tenants: [] }))).toBe(false);
  });
});

describe('diaryTenantsToAdd', () => {
  it('never adds the own tenant or a diary without consent', () => {
    expect(diaryTenantsToAdd({ tenants: ['scs'] }, [ok('scs'), ok('bka'), { ...ok('p13'), status: 'skipped-no-consent' }])).toEqual(['bka']);
  });
  it('adds nothing twice', () => expect(diaryTenantsToAdd({ tenants: ['scs', 'bka'] }, [ok('bka')])).toEqual([]));
  it('adds several diaries', () => expect(diaryTenantsToAdd({ tenants: ['scs'] }, [ok('bka'), ok('jp')])).toEqual(['bka', 'jp']));
});

describe('sweepCandidates', () => {
  const r = (okey: string, tenants: string[], startDate: string, over: Partial<TripModel> = {}, track = {}) => rec({ okey, tenants, startDate, ...over }, track);
  const args = { sourceTenant: 'scs', diaryTenant: 'bka', from: '20261001', to: '' };
  it('takes only own, live, in-period recordings not yet in the diary', () => {
    const recs = [r('a', ['scs'], '20261103'), r('b', ['scs', 'bka'], '20261103'), r('c', ['bkg'], '20261103'),
      r('d', ['scs'], '20260101'), r('e', ['scs'], '20261103', { isArchived: true }),
      r('f', ['scs'], '20261103', {}, { copyOf: 'x' }), r('g', ['scs'], '20261103', { deletedAt: '2026-11-03T10:00:00Z' })];
    expect(sweepCandidates(recs, args).map((x) => x.okey)).toEqual(['a']);
  });
  it('includes both bounds of the period', () => {
    const recs = [r('a', ['scs'], '20261001'), r('b', ['scs'], '20261020'), r('c', ['scs'], '20261021')];
    expect(sweepCandidates(recs, { ...args, to: '20261020' }).map((x) => x.okey)).toEqual(['a', 'b']);
  });
  it('treats empty bounds as open', () => {
    expect(sweepCandidates([r('a', ['scs'], '20200101')], { ...args, from: '', to: '' })).toHaveLength(1);
  });
});
