import { describe, expect, it } from 'vitest';
import { DiaryPull, DiarySourceModel } from '@okr/shared-models';
import { consentState, gainedSource, pullToTarget } from './diary-pull.util';

const doc = (pulls: DiaryPull[], from = '', to = ''): DiarySourceModel =>
  ({ okey: 'uBka', tenants: ['bka'], authorKey: 'uBka', from, to, pulls });

describe('pullToTarget', () => {
  it('intersects pull and consent', () => {
    expect(pullToTarget(doc([{ tenantId: 'scs', sources: ['taskDone', 'tracker'] }], '20261001', ''), 'bka', 'scs',
      [{ tenantId: 'bka', sources: ['tracker'] }])).toEqual({ tenantId: 'bka', sources: ['tracker'], from: '20261001', to: '' });
  });
  it('needs no consent from the diary app itself', () => {
    expect(pullToTarget(doc([{ tenantId: 'bka', sources: ['taskDone'] }]), 'bka', 'bka', undefined)?.sources).toEqual(['taskDone']);
  });
  it('has nothing to say without a doc or a pull for the source app', () => {
    expect(pullToTarget(undefined, 'bka', 'scs', [])).toBeUndefined();
    expect(pullToTarget(doc([{ tenantId: 'p13', sources: ['taskDone'] }]), 'bka', 'scs', [])).toBeUndefined();
  });
  it('keeps the pull with no sources when the consent names another diary', () => {
    expect(pullToTarget(doc([{ tenantId: 'scs', sources: ['taskDone'] }]), 'bka', 'scs', [{ tenantId: 'jp', sources: ['taskDone'] }])?.sources).toEqual([]);
  });
  it('reads legacy shapes without from, to or sources', () => {
    const legacy = { okey: 'u', tenants: ['bka'], authorKey: 'u', pulls: [{ tenantId: 'bka' }] } as unknown as DiarySourceModel;
    expect(pullToTarget(legacy, 'bka', 'bka', undefined)).toEqual({ tenantId: 'bka', sources: [], from: '', to: '' });
  });
});

describe('consentState', () => {
  it('is none when nothing is requested', () => expect(consentState([], ['taskDone'])).toBe('none'));
  it('waits while nothing requested is consented', () => expect(consentState(['taskDone'], [])).toBe('waiting'));
  it('is confirmed when the consent covers every row', () => expect(consentState(['taskDone'], ['taskDone', 'tracker'])).toBe('confirmed'));
  it('is partial when the consent covers fewer rows', () => expect(consentState(['taskDone', 'tracker'], ['tracker'])).toBe('partial'));
});

describe('gainedSource', () => {
  const after = [{ tenantId: 'bka', sources: ['tracker' as const] }];
  it('sees the transition', () => expect(gainedSource(undefined, after, 'bka', 'tracker')).toBe(true));
  it('sees no transition when the source was there', () => expect(gainedSource(after, after, 'bka', 'tracker')).toBe(false));
  it('looks only at the named diary', () => {
    expect(gainedSource([{ tenantId: 'jp', sources: ['tracker'] }], after, 'bka', 'tracker')).toBe(true);
    expect(gainedSource([], after, 'jp', 'tracker')).toBe(false);
  });
});
