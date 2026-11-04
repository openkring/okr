import { describe, expect, it } from 'vitest';
import type { DiarySource, DiarySourceModel, DiaryTarget } from '@okr/shared-models';
import { selectDiaryPulls, type PullUser } from './diary-pull';

const src = (over: Partial<PullUser> = {}): PullUser => ({ id: 'uScs', tenants: ['scs'], ...over });
const diary = (id: string, tenant: string, over: Partial<PullUser> = {}): PullUser => ({ id, tenants: [tenant], ...over });
const target = (tenantId: string, sources: DiarySource[]): DiaryTarget => ({ tenantId, sources, from: '', to: '' });
const pullDoc = (tenantId: string, sources: DiarySource[], from = '', to = ''): DiarySourceModel =>
  ({ okey: 'x', tenants: ['bka'], authorKey: 'x', from, to, pulls: [{ tenantId, sources }] });

function select(over: { users: PullUser[]; docs?: Record<string, DiarySourceModel | undefined>; diaryTenants?: string[]; noLogin?: string[]; date?: string; sourceTenant?: string }) {
  return selectDiaryPulls({
    users: over.users,
    sourceTenant: over.sourceTenant ?? 'scs',
    source: 'taskDone',
    date: over.date ?? '20261104',
    docs: over.docs ?? {},
    diaryTenants: new Set(over.diaryTenants ?? ['bka']),
    loginUids: new Set(over.users.map((u) => u.id).filter((id) => !(over.noLogin ?? []).includes(id))),
  });
}

describe('selectDiaryPulls', () => {
  const consented = { diaryConsents: [{ tenantId: 'bka', sources: ['taskDone' as const] }] };

  it('sends when pull and consent both allow it', () => {
    expect(select({ users: [src(consented), diary('uBka', 'bka')], docs: { uBka: pullDoc('scs', ['taskDone']) } }))
      .toEqual([{ tenantId: 'bka', uid: 'uBka', status: 'ok' }]);
  });
  it('reads the pull first and the old targets only without a pull doc', () => {
    const users = [src({ diaryTargets: [target('bka', ['taskDone'])] }), diary('uBka', 'bka')];
    expect(select({ users })).toEqual([{ tenantId: 'bka', uid: 'uBka', status: 'ok' }]);
    expect(select({ users, docs: { uBka: pullDoc('scs', []) } })).toEqual([]);
  });
  it('reports a pull without consent', () => {
    expect(select({ users: [src(), diary('uBka', 'bka')], docs: { uBka: pullDoc('scs', ['taskDone']) } }))
      .toEqual([{ tenantId: 'bka', uid: 'uBka', status: 'skipped-no-consent' }]);
  });
  it('ignores a consent without a pull', () => {
    expect(select({ users: [src(consented), diary('uBka', 'bka')], docs: { uBka: pullDoc('p13', ['taskDone']) } })).toEqual([]);
  });
  it('skips an archived diary user', () => {
    expect(select({ users: [src(consented), diary('uBka', 'bka', { isArchived: true })], docs: { uBka: pullDoc('scs', ['taskDone']) } })).toEqual([]);
  });
  it('skips a tenant without the diary block', () => {
    expect(select({ users: [src(consented), diary('uBka', 'bka')], docs: { uBka: pullDoc('scs', ['taskDone']) }, diaryTenants: [] })).toEqual([]);
  });
  it('skips a diary user who cannot log in', () => {
    expect(select({ users: [src(consented), diary('uBka', 'bka')], docs: { uBka: pullDoc('scs', ['taskDone']) }, noLogin: ['uBka'] })).toEqual([]);
  });
  it('skips everything when the source user cannot log in or is archived', () => {
    const docs = { uBka: pullDoc('scs', ['taskDone']) };
    expect(select({ users: [src(consented), diary('uBka', 'bka')], docs, noLogin: ['uScs'] })).toEqual([]);
    expect(select({ users: [src({ ...consented, isArchived: true }), diary('uBka', 'bka')], docs })).toEqual([]);
  });
  it('keeps the live diary when the other is dead', () => {
    const users = [src({ diaryConsents: [{ tenantId: 'bka', sources: ['taskDone'] }, { tenantId: 'jp', sources: ['taskDone'] }] }),
      diary('uBka', 'bka', { isArchived: true }), diary('uJp', 'jp')];
    expect(select({ users, docs: { uBka: pullDoc('scs', ['taskDone']), uJp: pullDoc('scs', ['taskDone']) }, diaryTenants: ['bka', 'jp'] }))
      .toEqual([{ tenantId: 'jp', uid: 'uJp', status: 'ok' }]);
  });
  it('keeps the period', () => {
    const docs = { uBka: pullDoc('scs', ['taskDone'], '20261001', '20261020') };
    const users = [src(consented), diary('uBka', 'bka')];
    expect(select({ users, docs, date: '20261021' })).toEqual([]);
    expect(select({ users, docs, date: '20261020' })).toHaveLength(1);
  });
  it('writes nothing while two live users share the diary tenant: it cannot tell whose diary it is', () => {
    const users = [src(consented), diary('uAdmin', 'bka'), diary('uBka', 'bka')];
    expect(select({ users, docs: { uBka: pullDoc('scs', ['taskDone']) } })).toEqual([]);
    expect(select({ users, docs: { uAdmin: pullDoc('scs', ['taskDone']), uBka: pullDoc('scs', ['taskDone']) } })).toEqual([]);
  });
  it('finds the live user when a dead one sorts first', () => {
    const docs = { uBka: pullDoc('scs', ['taskDone']) };
    expect(select({ users: [src(consented), diary('uBka2', 'bka'), diary('uBka', 'bka')], docs, noLogin: ['uBka2'] }))
      .toEqual([{ tenantId: 'bka', uid: 'uBka', status: 'ok' }]);
    expect(select({ users: [src(consented), diary('uBka2', 'bka', { isArchived: true }), diary('uBka', 'bka')], docs }))
      .toEqual([{ tenantId: 'bka', uid: 'uBka', status: 'ok' }]);
  });
  it('writes nothing while two live users share the source tenant: it cannot tell whose consent counts', () => {
    const users = [src(consented), src({ id: 'uScs2' }), diary('uBka', 'bka')];
    expect(select({ users, docs: { uBka: pullDoc('scs', ['taskDone']) } })).toEqual([]);
  });
  it('lets the diary app collect from itself without a consent', () => {
    const me = diary('uBka', 'bka');
    expect(select({ users: [me], sourceTenant: 'bka', docs: { uBka: pullDoc('bka', ['taskDone']) } }))
      .toEqual([{ tenantId: 'bka', uid: 'uBka', status: 'ok' }]);
  });
  it('tolerates legacy docs without consents or targets', () => {
    expect(select({ users: [src(), diary('uBka', 'bka')] })).toEqual([]);
  });
});
