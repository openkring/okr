import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';

vi.mock('./sentry', () => ({ reportToSentry: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../_gateway/http', () => ({ gatewayFetch: vi.fn() }));
vi.mock('../_gateway/adapters/srv', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_gateway/adapters/srv')>()),
  regasoftHeaders: () => ({ ApiKey: 'k', ClubId: 'c' }),
}));

import { reportToSentry } from './sentry';
import { gatewayFetch } from '../_gateway/http';
import { SRV_DETAIL_FIELDS, SRV_LIST_FIELDS } from '../_gateway/adapters/srv';
import {
  ApiFingerprint, PARAM_OVERSIZE, WatchState, buildFingerprint, checkShape, decideWatch, diffFingerprint, probeRegasoft, resetShapeCheck,
  resolveCreateKey, runRegasoftApiWatch,
} from './api-watch';

const NOW = new Date('2026-11-03T06:00:00Z'); // 07:00 in Zurich
const MEMBER = { id: 1, firstName: 'A', lastName: 'B', email: 'a@b.ch', mobile: null };

const probe = (over: Record<string, unknown> = {}) => ({
  listStatus: 200,
  list: { data: [MEMBER], success: true, message: null },
  detail: { data: { id: 1, personClubs: [{ clubId: 1, clubName: 'X', mainClub: true }] }, success: true, message: null },
  all: { data: [{ ...MEMBER, street: 's', personClubs: [{ personId: 0, clubId: 1, clubName: 'X', mainClub: true }] }], success: true, message: null },
  allInactive: { data: [{ ...MEMBER, street: 's', leavingDate: '2025-12-31T00:00:00' }], success: true, message: null },
  listInactive: { data: [MEMBER], success: true, message: null },
  countries: { data: [{ id: 3, countryCode: 'CH', ioc: 'SUI' }], success: true, message: '' },
  err401: { data: null, success: false, message: 'Invalid client credentials' },
  err400: { errors: { id: ['bad'] }, type: 't', title: 'x', status: 400 },
  docs: { '/swagger': 404, '/docs': 404 },
  ...over,
});

describe('buildFingerprint', () => {
  it('is equal for two lists that differ only in values', () => {
    const a = buildFingerprint(probe());
    const same = { data: [{ ...MEMBER, firstName: 'Z', email: 'z@z.ch', id: 99 }], success: true, message: null };
    const b = buildFingerprint(probe({ list: same, listInactive: same }));
    expect(diffFingerprint(a, b)).toEqual([]);
  });

  it('holds names and types only, never values', () => {
    const fp = buildFingerprint(probe({ list: { data: [{ ...MEMBER, firstName: 'Secretname' }], success: true, message: null } }));
    expect(JSON.stringify(fp)).not.toContain('Secretname');
    expect(JSON.stringify(fp)).not.toContain('a@b.ch');
  });

  it('describes fields with sorted types, null last', () => {
    const fp = buildFingerprint(probe());
    expect(fp['list.fields']).toBe('email:string,firstName:string,id:number,lastName:string,mobile:null');
    const two = buildFingerprint(probe({ list: { data: [MEMBER, { ...MEMBER, mobile: '079' }], success: true, message: null } }));
    expect(two['list.fields']).toContain('mobile:string|null');
  });

  it('reports an extra field as a list.fields difference', () => {
    const a = buildFingerprint(probe());
    const extra = { data: [{ ...MEMBER, newField: true }], success: true, message: null };
    const b = buildFingerprint(probe({ list: extra }));
    const diff = diffFingerprint(a, b);
    expect(diff.map(d => d.key)).toEqual(['list.fields']);
    expect(diff[0].after).toContain('newField:boolean');
    expect(diff[0].before).not.toContain('newField');
  });

  it('fingerprints the endpoints shipped 2026-11-02: /all, /all?inactive, list?inactive, nationIoc (C4)', () => {
    const fp = buildFingerprint(probe());
    expect(fp['all.envelope']).toBe('data,message,success');
    expect(fp['all.fields']).toBe('email,firstName,id,lastName,mobile,personClubs,street');
    expect(fp['all.personClubs']).toBe('clubId,clubName,mainClub,personId');
    expect(fp['allInactive.fields']).toContain('leavingDate');
    expect(fp['list.inactive.fields']).toBe('email,firstName,id,lastName,mobile');
    expect(fp['countries.envelope']).toBe('data,message,success');
    expect(fp['countries.fields']).toBe('countryCode:string,id:number,ioc:string');
    expect(Object.keys(fp).some(k => k.startsWith('param.'))).toBe(false);
  });

  it('holds no value of the country list or of /all', () => {
    const fp = JSON.stringify(buildFingerprint(probe()));
    expect(fp).not.toContain('SUI');
    expect(fp).not.toContain('2025-12-31');
  });

  it('reports when Regasoft fixes the personId 0 in /all personClubs', () => {
    const club = (personId: number) => ({ personId, clubId: 1, clubName: 'X', mainClub: true });
    const allWith = (...ids: number[]) => ({ data: [{ ...MEMBER, street: 's', personClubs: ids.map(club) }], success: true, message: null });
    expect(buildFingerprint(probe())['all.personClubs.personId']).toBe('zero');
    expect(buildFingerprint(probe({ all: allWith(26183) }))['all.personClubs.personId']).toBe('set');
    expect(buildFingerprint(probe({ all: allWith(0, 26183) }))['all.personClubs.personId']).toBe('mixed');
    expect(buildFingerprint(probe({ all: allWith() }))['all.personClubs.personId']).toBe('none');
    const fixed = diffFingerprint(buildFingerprint(probe()), buildFingerprint(probe({ all: allWith(26183) })));
    expect(fixed).toEqual([{ key: 'all.personClubs.personId', before: 'zero', after: 'set' }]);
  });

  it('reports whether the test system marks emails with x — a share, never an address', () => {
    const allWith = (...emails: (string | null)[]) => ({ data: emails.map(email => ({ ...MEMBER, street: 's', email, personClubs: [] })), success: true, message: null });
    expect(buildFingerprint(probe())['all.email.testMark']).toBe('none');
    expect(buildFingerprint(probe({ all: allWith('a@b.chx', 'c@d.comx') }))['all.email.testMark']).toBe('all');
    expect(buildFingerprint(probe({ all: allWith('a@b.chx', 'c@d.com') }))['all.email.testMark']).toBe('some');
    expect(buildFingerprint(probe({ all: allWith(null, '') }))['all.email.testMark']).toBe('noEmail');
    expect(JSON.stringify(buildFingerprint(probe({ all: allWith('secret@b.chx') })))).not.toContain('secret');
  });

  it('a new field in /all is a difference of all.fields only', () => {
    const base = probe();
    const record = (base.all as { data: Record<string, unknown>[] }).data[0];
    const withModified = { data: [{ ...record, modified: '2026-11-02T17:04:04.54' }], success: true, message: null };
    const diff = diffFingerprint(buildFingerprint(base), buildFingerprint(probe({ all: withModified })));
    expect(diff.map(d => d.key)).toEqual(['all.fields']);
    expect(diff[0].after).toContain('modified');
  });

  it('a value turning from null to a date in /all is no change (field names only)', () => {
    const base = probe();
    const record = (base.all as { data: Record<string, unknown>[] }).data[0];
    const nulls = { data: [{ ...record, leavingDate: null, mobile: null }], success: true, message: null };
    const dates = { data: [{ ...record, leavingDate: '2027-01-31T00:00:00', mobile: '079' }, { ...record, leavingDate: null }], success: true, message: null };
    expect(diffFingerprint(buildFingerprint(probe({ all: nulls, allInactive: nulls })), buildFingerprint(probe({ all: dates, allInactive: dates })))).toEqual([]);
  });

  it('a large probe answering other than 200 is a stable status value, not a transient marker', () => {
    const fp = buildFingerprint(probe({ all: { probeStatus: 404 }, countries: { probeStatus: 401 } }));
    expect(fp['all.fields']).toBe('status:404');
    expect(fp['all.personClubs.personId']).toBe('status:404');
    expect(fp['countries.fields']).toBe('status:401');
  });

  it('marks a large probe over the size cap as oversize (I7)', () => {
    const fp = buildFingerprint(probe({ all: PARAM_OVERSIZE }));
    expect(fp['all.fields']).toBe('oversize');
    expect(fp['all.envelope']).toBe('oversize');
    expect(fp['allInactive.fields']).toContain('leavingDate');
  });

  it('marks a large probe that threw as unavailable', () => {
    const fp = buildFingerprint(probe({ countries: undefined, allInactive: undefined }));
    expect(fp['countries.fields']).toBe('unavailable');
    expect(fp['allInactive.fields']).toBe('unavailable');
    expect(fp['all.fields']).not.toBe('unavailable');
  });

  it('records the auth status under the system name, the error shapes and the doc statuses', () => {
    const fp = buildFingerprint(probe());
    expect(fp['auth.test']).toBe('200');
    expect(buildFingerprint(probe(), 'production')['auth.production']).toBe('200');
    expect(fp['error.401']).toBe('data,message,success');
    expect(fp['error.400']).toBe('errors,status,title,type');
    expect(fp['docs./swagger']).toBe('404');
    expect(fp['list.envelope']).toBe('data,message,success');
    expect(fp['detail.personClubs']).toBe('clubId:number,clubName:string,mainClub:boolean');
  });

  it('notices an API doc appearing', () => {
    const a = buildFingerprint(probe());
    const b = buildFingerprint(probe({ docs: { '/swagger': 200, '/docs': 404 } }));
    expect(diffFingerprint(a, b)).toEqual([{ key: 'docs./swagger', before: '404', after: '200' }]);
  });
});

describe('diffFingerprint', () => {
  it('reports added and removed keys with an empty side', () => {
    expect(diffFingerprint({ a: '1' }, { b: '2' })).toEqual([
      { key: 'a', before: '1', after: '' },
      { key: 'b', before: '', after: '2' },
    ]);
  });
});

describe('decideWatch', () => {
  const fp: ApiFingerprint = { 'auth.test': '200', 'list.fields': 'id:number' };
  const changed: ApiFingerprint = { 'auth.test': '200', 'list.fields': 'id:number,x:string' };
  const state = (over: Partial<WatchState> = {}): WatchState => ({
    accepted: fp, pending: null, taskKey: '', lastRunMonth: '202610', failures: 0, ...over,
  });
  const ok = (f: ApiFingerprint) => ({ reachable: true as const, fingerprint: f });
  const down = { reachable: false as const };

  it('first run: the fingerprint becomes accepted, no task', () => {
    const d = decideWatch(undefined, ok(fp), 'none', NOW);
    expect(d.task).toBeNull();
    expect(d.state).toEqual({ accepted: fp, pending: null, taskKey: '', lastRunMonth: '202611', failures: 0 });
  });

  it('does nothing before the month changes', () => {
    const s = state({ lastRunMonth: '202611' });
    const d = decideWatch(s, ok(changed), 'none', NOW);
    expect(d.task).toBeNull();
    expect(d.state).toEqual(s);
  });

  it('unchanged: month recorded, no task', () => {
    const d = decideWatch(state(), ok(fp), 'none', NOW);
    expect(d.task).toBeNull();
    expect(d.state.lastRunMonth).toBe('202611');
    expect(d.state.pending).toBeNull();
  });

  it('change: pending is set and a task is created', () => {
    const d = decideWatch(state(), ok(changed), 'none', NOW);
    expect(d.state.pending).toEqual(changed);
    expect(d.state.accepted).toEqual(fp);
    expect(d.state.taskKey).toBe('regasoft-api-watch-202611');
    expect(d.task).toMatchObject({ op: 'create', key: 'regasoft-api-watch-202611', reason: 'changed' });
    expect(d.task?.diff).toEqual([{ key: 'list.fields', before: 'id:number', after: 'id:number,x:string' }]);
  });

  it('a later run with the task still open updates the same task and diffs against accepted', () => {
    const s = state({ pending: changed, taskKey: 'regasoft-api-watch-202610', lastRunMonth: '202610' });
    const further: ApiFingerprint = { ...changed, 'docs./swagger': '200' };
    const d = decideWatch(s, ok(further), 'open', NOW);
    expect(d.task).toMatchObject({ op: 'update', key: 'regasoft-api-watch-202610', reason: 'changed' });
    expect(d.task?.diff.map(x => x.key)).toEqual(['docs./swagger', 'list.fields']);
    expect(d.state.accepted).toEqual(fp);
    expect(d.state.pending).toEqual(further);
    expect(d.state.taskKey).toBe('regasoft-api-watch-202610');
  });

  it('task done: pending becomes accepted, even before the month changes', () => {
    const s = state({ pending: changed, taskKey: 'regasoft-api-watch-202610', lastRunMonth: '202611' });
    const d = decideWatch(s, ok(changed), 'done', NOW);
    expect(d.state.accepted).toEqual(changed);
    expect(d.state.pending).toBeNull();
    expect(d.task).toBeNull();
  });

  it('task done and the API changed again: diff against the newly accepted one', () => {
    const s = state({ pending: changed, taskKey: 'regasoft-api-watch-202610' });
    const again: ApiFingerprint = { ...changed, 'list.fields': 'id:number,x:string,y:string' };
    const d = decideWatch(s, ok(again), 'done', NOW);
    expect(d.state.accepted).toEqual(changed);
    expect(d.task).toMatchObject({ op: 'create', key: 'regasoft-api-watch-202611' });
    expect(d.task?.diff).toEqual([{ key: 'list.fields', before: 'id:number,x:string', after: 'id:number,x:string,y:string' }]);
  });

  it('API back to the accepted shape: pending is cleared and an open task says so', () => {
    const s = state({ pending: changed, taskKey: 'regasoft-api-watch-202610' });
    const d = decideWatch(s, ok(fp), 'open', NOW);
    expect(d.state.pending).toBeNull();
    expect(d.task).toMatchObject({ op: 'update', diff: [] });
  });

  it('unreachable once: failure counted, no month recorded, no task', () => {
    const d = decideWatch(state(), down, 'none', NOW);
    expect(d.task).toBeNull();
    expect(d.state.failures).toBe(1);
    expect(d.state.lastRunMonth).toBe('202610');
  });

  it('unreachable twice: a task at once', () => {
    const d = decideWatch(state({ failures: 1 }), down, 'none', NOW);
    expect(d.state.failures).toBe(2);
    expect(d.state.lastRunMonth).toBe('202610');
    expect(d.task).toMatchObject({ op: 'create', key: 'regasoft-api-watch-202611', reason: 'unreachable' });
  });

  it('unreachable again while that task is open: no second write', () => {
    const d = decideWatch(state({ failures: 2, taskKey: 'regasoft-api-watch-202611' }), down, 'open', NOW);
    expect(d.state.failures).toBe(3);
    expect(d.task).toBeNull();
  });

  it('a reachable run resets the failure count', () => {
    expect(decideWatch(state({ failures: 1 }), ok(fp), 'none', NOW).state.failures).toBe(0);
  });

  describe('transient markers', () => {
    const base: ApiFingerprint = { 'auth.test': '200', 'list.fields': 'id:number', 'docs./swagger': '404', 'all.fields': 'id:number', 'error.401': 'data,message,success', 'error.401.status': '401' };

    it('a doc path that timed out is no change; accepted stays as it was', () => {
      const d = decideWatch(state({ accepted: base }), ok({ ...base, 'docs./swagger': 'error' }), 'none', NOW);
      expect(d.task).toBeNull();
      expect(d.state.accepted).toEqual(base);
      expect(d.state.pending).toBeNull();
      expect(d.state.lastRunMonth).toBe('202611');
    });

    it('all.fields going unavailable is no change', () => {
      const d = decideWatch(state({ accepted: base }), ok({ ...base, 'all.fields': 'unavailable' }), 'none', NOW);
      expect(d.task).toBeNull();
      expect(d.state.accepted).toEqual(base);
    });

    it('a failed error probe (marker plus omitted status key) is no change', () => {
      const { 'error.401.status': _omitted, ...rest } = base;
      void _omitted;
      const d = decideWatch(state({ accepted: base }), ok({ ...rest, 'error.401': 'error' }), 'none', NOW);
      expect(d.task).toBeNull();
      expect(d.state.accepted).toEqual(base);
    });

    it('one real change and one marker: the task lists only the change, pending carries the old value', () => {
      const d = decideWatch(state({ accepted: base }),
        ok({ ...base, 'list.fields': 'id:number,x:string', 'docs./swagger': 'error', 'all.fields': 'unavailable' }), 'none', NOW);
      expect(d.task?.diff).toEqual([{ key: 'list.fields', before: 'id:number', after: 'id:number,x:string' }]);
      expect(d.state.pending).toEqual({ ...base, 'list.fields': 'id:number,x:string' });
      expect(JSON.stringify(d.state)).not.toContain('error"');
    });

    it('a marker with no accepted value is left out of the baseline and of pending', () => {
      const first = decideWatch(undefined, ok({ 'auth.test': '200', 'detail.fields': 'error', 'docs./docs': 'error' }), 'none', NOW);
      expect(first.state.accepted).toEqual({ 'auth.test': '200' });
      const later = decideWatch(state({ accepted: { 'auth.test': '200' } }), ok({ 'auth.test': '200', 'detail.fields': 'unavailable', 'x': '1' }), 'none', NOW);
      expect(later.state.pending).toEqual({ 'auth.test': '200', x: '1' });
    });
  });

  it('login rejected: a task at once, nothing accepted', () => {
    const bad: ApiFingerprint = { ...fp, 'auth.test': '401' };
    const d = decideWatch(state(), ok(bad), 'none', NOW);
    expect(d.task).toMatchObject({ op: 'create', reason: 'auth' });
    expect(d.state.accepted).toEqual(fp);
    expect(d.state.lastRunMonth).toBe('202611');
  });

  it('login rejected on the very first run: no baseline is taken', () => {
    const bad: ApiFingerprint = { ...fp, 'auth.test': '401' };
    const d = decideWatch(undefined, ok(bad), 'none', NOW);
    expect(d.task).toMatchObject({ reason: 'auth' });
    expect(d.state.accepted).toEqual({});
  });
});

describe('checkShape', () => {
  beforeEach(() => { resetShapeCheck(); vi.mocked(reportToSentry).mockClear(); });
  afterEach(() => vi.restoreAllMocks());
  const all = (fields: readonly string[]) => Object.fromEntries(fields.map(f => [f, null]));

  it('stays quiet when the fields match', () => {
    checkShape('list', { data: [all(SRV_LIST_FIELDS)] }, SRV_LIST_FIELDS);
    checkShape('detail', { data: all(SRV_DETAIL_FIELDS) }, SRV_DETAIL_FIELDS);
    expect(reportToSentry).not.toHaveBeenCalled();
  });

  it('reports unknown and missing field names, never values', () => {
    const rec = { ...all(SRV_LIST_FIELDS), brandNew: 'secret value' };
    delete (rec as Record<string, unknown>)['language'];
    checkShape('list', [rec], SRV_LIST_FIELDS);
    expect(reportToSentry).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(reportToSentry).mock.calls[0][0];
    expect(arg).toMatchObject({ message: 'Regasoft response shape changed', tags: { kind: 'list' }, extra: { unknown: ['brandNew'], missing: ['language'] } });
    expect(JSON.stringify(arg)).not.toContain('secret value');
  });

  it('reports at most once per kind', () => {
    const rec = { ...all(SRV_LIST_FIELDS), brandNew: 1 };
    checkShape('list', [rec], SRV_LIST_FIELDS);
    checkShape('list', [rec], SRV_LIST_FIELDS);
    checkShape('detail', { ...all(SRV_DETAIL_FIELDS), other: 1 }, SRV_DETAIL_FIELDS);
    expect(reportToSentry).toHaveBeenCalledTimes(2);
  });

  it('checks the union over a list, so one record without a nullable field is fine', () => {
    const a = all(SRV_LIST_FIELDS);
    const b = { ...all(SRV_LIST_FIELDS) };
    delete (b as Record<string, unknown>)['email'];
    checkShape('list', [a, b], SRV_LIST_FIELDS);
    expect(reportToSentry).not.toHaveBeenCalled();
  });

  it('ignores an empty list and a response that is not a record', () => {
    checkShape('list', { data: [] }, SRV_LIST_FIELDS);
    checkShape('detail', null, SRV_DETAIL_FIELDS);
    expect(reportToSentry).not.toHaveBeenCalled();
  });
});

describe('runRegasoftApiWatch', () => {
  type Doc = Record<string, unknown>;
  function fakeDb(initial: Record<string, Doc> = {}) {
    const store = new Map<string, Doc>(Object.entries(initial));
    const db = {
      collection: (c: string) => ({
        doc: (id: string) => ({
          id,
          get: async () => ({ exists: store.has(`${c}/${id}`), data: () => store.get(`${c}/${id}`) }),
          set: async (d: Doc) => { store.set(`${c}/${id}`, d); },
          create: async (d: Doc) => {
            if (store.has(`${c}/${id}`)) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
            store.set(`${c}/${id}`, d);
          },
          update: async (d: Doc) => { store.set(`${c}/${id}`, { ...(store.get(`${c}/${id}`) ?? {}), ...d }); },
        }),
      }),
    } as unknown as Firestore;
    return { db, store };
  }
  const fp: ApiFingerprint = { 'auth.test': '200', 'list.fields': 'id:number' };

  it('first run writes the state document and no task', async () => {
    const { db, store } = fakeDb();
    await runRegasoftApiWatch(NOW, { db, probe: async () => ({ reachable: true, fingerprint: fp }) });
    expect(store.get('integration-health/regasoft')).toEqual({ accepted: fp, pending: null, taskKey: '', lastRunMonth: '202611', failures: 0 });
    expect([...store.keys()].filter(k => k.startsWith('tasks/'))).toEqual([]);
  });

  it('a change creates the task for tenant scs, unassigned when nobody holds scs-srv', async () => {
    const { db, store } = fakeDb({ 'integration-health/regasoft': { accepted: fp, pending: null, taskKey: '', lastRunMonth: '202610', failures: 0 } });
    await runRegasoftApiWatch(NOW, { db, probe: async () => ({ reachable: true, fingerprint: { ...fp, 'list.fields': 'id:number,x:string' } }) });
    const task = store.get('tasks/regasoft-api-watch-202611');
    expect(task).toBeDefined();
    expect(task?.['tenants']).toEqual(['scs']);
    expect(task).not.toHaveProperty('okey');
    expect(task).not.toHaveProperty('assignee');
    expect(String(task?.['notes'])).toContain('list.fields');
    expect(String(task?.['notes'])).toContain('REGASOFT.md');
    expect((store.get('integration-health/regasoft') as Doc)['pending']).toBeTruthy();
  });

  it('assigns the holder of the scs-srv responsibility', async () => {
    const { db, store } = fakeDb({
      'integration-health/regasoft': { accepted: fp, pending: null, taskKey: '', lastRunMonth: '202610', failures: 0 },
      'responsibilities/scs-srv': { isArchived: false, responsibleAvatar: { key: 'p1', name1: 'Bruno', name2: 'Kaiser', modelType: 'person' } },
    });
    await runRegasoftApiWatch(NOW, { db, probe: async () => ({ reachable: true, fingerprint: { ...fp, 'auth.test': '401' } }) });
    expect((store.get('tasks/regasoft-api-watch-202611')?.['assignee'] as Doc | undefined)?.['key']).toBe('p1');
  });

  it('an open task gets its notes refreshed, text below the marker is kept', async () => {
    const { db, store } = fakeDb({
      'integration-health/regasoft': { accepted: fp, pending: { ...fp, a: '1' }, taskKey: 'regasoft-api-watch-202610', lastRunMonth: '202610', failures: 0 },
      'tasks/regasoft-api-watch-202610': { state: 'open', completionDate: '', notes: 'old\n--- Notizen ---\nmy own words', name: 'n', tenants: ['scs'] },
    });
    await runRegasoftApiWatch(NOW, { db, probe: async () => ({ reachable: true, fingerprint: { ...fp, 'list.fields': 'id:number,x:string' } }) });
    const notes = String(store.get('tasks/regasoft-api-watch-202610')?.['notes']);
    expect(notes).toContain('list.fields');
    expect(notes).toContain('my own words');
  });

  it('a done task promotes pending to accepted', async () => {
    const pending = { ...fp, a: '1' };
    const { db, store } = fakeDb({
      'integration-health/regasoft': { accepted: fp, pending, taskKey: 'regasoft-api-watch-202610', lastRunMonth: '202611', failures: 0 },
      'tasks/regasoft-api-watch-202610': { state: 'done', completionDate: '20261102', notes: '' },
    });
    const probeFn = vi.fn();
    await runRegasoftApiWatch(NOW, { db, probe: probeFn });
    expect((store.get('integration-health/regasoft') as Doc)['accepted']).toEqual(pending);
    expect(probeFn).not.toHaveBeenCalled(); // month already done: no Regasoft call
  });

  it('a cancelled task closes the review like a done one', async () => {
    const pending = { ...fp, a: '1' };
    const { db, store } = fakeDb({
      'integration-health/regasoft': { accepted: fp, pending, taskKey: 'regasoft-api-watch-202610', lastRunMonth: '202611', failures: 0 },
      'tasks/regasoft-api-watch-202610': { state: 'cancelled', completionDate: '', notes: '' },
    });
    await runRegasoftApiWatch(NOW, { db, probe: vi.fn() });
    expect((store.get('integration-health/regasoft') as Doc)['accepted']).toEqual(pending);
  });

  it('a task parked as «later» stays open', async () => {
    const pending = { ...fp, a: '1' };
    const { db, store } = fakeDb({
      'integration-health/regasoft': { accepted: fp, pending, taskKey: 'regasoft-api-watch-202610', lastRunMonth: '202611', failures: 0 },
      'tasks/regasoft-api-watch-202610': { state: 'later', completionDate: '', notes: '' },
    });
    await runRegasoftApiWatch(NOW, { db, probe: vi.fn() });
    expect((store.get('integration-health/regasoft') as Doc)['pending']).toEqual(pending);
  });

  it('never overwrites a closed task of the same month: the new one gets a suffixed key', async () => {
    const closed = { state: 'done', completionDate: '20261102', notes: 'reviewed', name: 'Regasoft: nicht erreichbar', tenants: ['scs'] };
    const { db, store } = fakeDb({
      'integration-health/regasoft': { accepted: fp, pending: null, taskKey: '', lastRunMonth: '202610', failures: 0 },
      'tasks/regasoft-api-watch-202611': closed,
    });
    await runRegasoftApiWatch(NOW, { db, probe: async () => ({ reachable: true, fingerprint: { ...fp, 'list.fields': 'id:number,x:string' } }) });
    expect(store.get('tasks/regasoft-api-watch-202611')).toEqual(closed);
    expect(String(store.get('tasks/regasoft-api-watch-202611-2')?.['notes'])).toContain('list.fields');
    expect((store.get('integration-health/regasoft') as Doc)['taskKey']).toBe('regasoft-api-watch-202611-2');
  });
});

describe('resolveCreateKey', () => {
  const statusOf = (known: Record<string, 'open' | 'done'>) => async (key: string) => known[key] ?? 'none';

  it('takes the key when no task has it', async () => {
    expect(await resolveCreateKey('k', statusOf({}))).toEqual({ key: 'k', op: 'create' });
  });

  it('skips closed tasks to the next free suffix', async () => {
    expect(await resolveCreateKey('k', statusOf({ k: 'done', 'k-2': 'done' }))).toEqual({ key: 'k-3', op: 'create' });
  });

  it('updates an open task with that key instead of creating over it', async () => {
    expect(await resolveCreateKey('k', statusOf({ k: 'done', 'k-2': 'open' }))).toEqual({ key: 'k-2', op: 'update' });
  });
});

describe('probeRegasoft', () => {
  const fetchMock = vi.mocked(gatewayFetch);
  const ok = (data: unknown, status = 200) => ({ status, data });
  /** routes by url: `fail` URL fragments reject, everything else answers like a healthy API */
  function route(fail: string[]) {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string, opts?: { headers?: Record<string, string> }) => {
      if (fail.some(f => url.endsWith(f))) throw new Error('timeout');
      if (url.endsWith('/api/club/members/26183')) return ok({ data: { id: 1, firstName: 'A' } }) as never;
      if (url.endsWith('/api/club/members/schema')) return ok({ errors: {}, type: 't', title: 'x', status: 400 }, 400) as never;
      if (url.endsWith('/api/nationIoc')) return ok({ data: [{ id: 3, countryCode: 'CH', ioc: 'SUI' }], success: true, message: '' }) as never;
      if (url.includes('/api/club/members')) {
        return (opts?.headers?.['ApiKey'] === 'invalid' ? ok({ data: null, success: false, message: 'no' }, 401) : ok({ data: [{ id: 1, firstName: 'A' }], success: true, message: null })) as never;
      }
      return ok('', 404) as never;
    });
  }

  it('a doc path that throws is recorded as error and the run stays reachable', async () => {
    route(['/swagger']);
    const r = await probeRegasoft();
    expect(r.reachable).toBe(true);
    if (!r.reachable) return;
    expect(r.fingerprint['docs./swagger']).toBe('error');
    expect(r.fingerprint['docs./docs']).toBe('404');
    expect(r.fingerprint['auth.test']).toBe('200');
  });

  it('a list that throws is unreachable', async () => {
    route(['/api/club/members']);
    expect((await probeRegasoft()).reachable).toBe(false);
  });

  it('a list answering 5xx is unreachable', async () => {
    route([]);
    fetchMock.mockResolvedValueOnce(ok('down', 503) as never);
    expect((await probeRegasoft()).reachable).toBe(false);
  });

  it('a detail probe that throws gives detail.* = error, still reachable', async () => {
    route(['/api/club/members/26183']);
    const r = await probeRegasoft();
    expect(r.reachable).toBe(true);
    if (!r.reachable) return;
    expect(r.fingerprint['detail.fields']).toBe('error');
    expect(r.fingerprint['detail.envelope']).toBe('error');
    expect(r.fingerprint['list.fields']).toContain('id:number');
  });

  it('an error-shape probe that throws gives error.40x = error, still reachable', async () => {
    route(['/api/club/members/schema']);
    const r = await probeRegasoft();
    expect(r.reachable).toBe(true);
    if (!r.reachable) return;
    expect(r.fingerprint['error.400']).toBe('error');
    expect(r.fingerprint['error.401']).toBe('data,message,success');
  });

  it('runs the four large probes one after the other, capped at 2 MiB, without retry (C4, I7)', async () => {
    route([]);
    const healthy = fetchMock.getMockImplementation();
    const isLarge = (url: string) => url.includes('/all') || url.includes('?') || url.endsWith('/api/nationIoc');
    let inFlight = 0;
    let maxInFlight = 0;
    fetchMock.mockImplementation(async (url: string, opts?: Record<string, unknown>) => {
      if (!isLarge(url)) return healthy?.(url, opts as never) as never;
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(r => setTimeout(r, 5));
      inFlight--;
      return healthy?.(url, opts as never) as never;
    });
    const r = await probeRegasoft();
    expect(maxInFlight).toBe(1);
    const largeCalls = fetchMock.mock.calls.filter(([url]) => isLarge(String(url)));
    expect(largeCalls.map(([url]) => String(url).replace(/^.*\/PortalTest/, ''))).toEqual([
      '/api/club/members/all', '/api/club/members/all?inactive=true', '/api/club/members?inactive=true', '/api/nationIoc',
    ]);
    for (const [, opts] of largeCalls) {
      expect(opts).toMatchObject({ maxBytes: 2 * 1024 * 1024, maxRetries: 0 });
    }
    expect(r.reachable && r.fingerprint['countries.fields']).toBe('countryCode:string,id:number,ioc:string');
    expect(r.reachable && r.fingerprint['all.fields']).toBe('firstName,id');
  });

  it('a large probe over the cap is reported as oversize, not as a transient failure (I7)', async () => {
    route([]);
    const healthy = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (url: string, opts?: Record<string, unknown>) => {
      if (url.endsWith('/all?inactive=true')) throw new Error('maxContentLength size of 2097152 exceeded');
      return healthy?.(url, opts as never) as never;
    });
    const r = await probeRegasoft();
    expect(r.reachable).toBe(true);
    if (!r.reachable) return;
    expect(r.fingerprint['allInactive.fields']).toBe('oversize');
    const accepted = { ...r.fingerprint, 'allInactive.fields': 'id:number' };
    const state: WatchState = { accepted, pending: null, taskKey: '', lastRunMonth: '202610', failures: 0 };
    const d = decideWatch(state, r, 'none', NOW);
    expect(d.task?.diff).toEqual([{ key: 'allInactive.fields', before: 'id:number', after: 'oversize' }]);
  });

  it('a removed endpoint (404) is reported as a change, not swallowed as unavailable', async () => {
    route([]);
    const healthy = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (url: string, opts?: Record<string, unknown>) => {
      if (url.endsWith('/api/club/members/all')) return ok('', 404) as never;
      return healthy?.(url, opts as never) as never;
    });
    const r = await probeRegasoft();
    expect(r.reachable).toBe(true);
    if (!r.reachable) return;
    expect(r.fingerprint['all.fields']).toBe('status:404');
    const accepted = { ...r.fingerprint, 'all.fields': 'id', 'all.envelope': 'data,message,success', 'all.personClubs': 'none', 'all.personClubs.personId': 'none' };
    const state: WatchState = { accepted, pending: null, taskKey: '', lastRunMonth: '202610', failures: 0 };
    const d = decideWatch(state, r, 'none', NOW);
    expect(d.task?.diff.map(x => x.key)).toEqual(['all.envelope', 'all.fields', 'all.personClubs', 'all.personClubs.personId']);
  });

  it('the country list failing is unavailable and still reachable', async () => {
    route(['/api/nationIoc']);
    const r = await probeRegasoft();
    expect(r.reachable).toBe(true);
    if (!r.reachable) return;
    expect(r.fingerprint['countries.fields']).toBe('unavailable');
  });

  it('a failed side probe never counts as a failure in the run', async () => {
    route(['/swagger']);
    const written: Record<string, unknown> = {};
    const db = { collection: () => ({ doc: (id: string) => ({ id, get: async () => ({ exists: false, data: () => undefined }), set: async (d: unknown) => { written[id] = d; } }) }) } as unknown as Firestore;
    await runRegasoftApiWatch(NOW, { db, probe: probeRegasoft });
    expect((written['regasoft'] as { failures: number }).failures).toBe(0);
  });
});
