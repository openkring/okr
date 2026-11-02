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
  ApiFingerprint, WatchState, buildFingerprint, checkShape, decideWatch, diffFingerprint, probeRegasoft, resetShapeCheck, runRegasoftApiWatch,
} from './api-watch';

const NOW = new Date('2026-11-03T06:00:00Z'); // 07:00 in Zurich
const MEMBER = { id: 1, firstName: 'A', lastName: 'B', email: 'a@b.ch', mobile: null };

const probe = (over: Record<string, unknown> = {}) => ({
  listStatus: 200,
  list: { data: [MEMBER], success: true, message: null },
  detail: { data: { id: 1, personClubs: [{ clubId: 1, clubName: 'X', mainClub: true }] }, success: true, message: null },
  listAll: { data: [MEMBER], success: true, message: null },
  listInactive: { data: [MEMBER], success: true, message: null },
  err401: { data: null, success: false, message: 'Invalid client credentials' },
  err400: { errors: { id: ['bad'] }, type: 't', title: 'x', status: 400 },
  docs: { '/swagger': 404, '/docs': 404 },
  ...over,
});

describe('buildFingerprint', () => {
  it('is equal for two lists that differ only in values', () => {
    const a = buildFingerprint(probe());
    const same = { data: [{ ...MEMBER, firstName: 'Z', email: 'z@z.ch', id: 99 }], success: true, message: null };
    const b = buildFingerprint(probe({ list: same, listAll: same, listInactive: same }));
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
    const b = buildFingerprint(probe({ list: extra, listAll: extra, listInactive: extra }));
    const diff = diffFingerprint(a, b);
    expect(diff.map(d => d.key)).toEqual(['list.fields']);
    expect(diff[0].after).toContain('newField:boolean');
    expect(diff[0].before).not.toContain('newField');
  });

  it('flips param.all from ignored to changes when listAll has more fields', () => {
    expect(buildFingerprint(probe())['param.all']).toBe('ignored');
    const all = { data: [{ ...MEMBER, street: 's' }], success: true, message: null };
    expect(buildFingerprint(probe({ listAll: all }))['param.all']).toBe('changes');
  });

  it('flips param.inactive to changes when the count differs', () => {
    const more = { data: [MEMBER, MEMBER], success: true, message: null };
    expect(buildFingerprint(probe({ listInactive: more }))['param.inactive']).toBe('changes');
  });

  it('marks a parameter probe that failed as unavailable', () => {
    expect(buildFingerprint(probe({ listAll: undefined }))['param.all']).toBe('unavailable');
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

  it('a failed side probe never counts as a failure in the run', async () => {
    route(['/swagger']);
    const fp = { 'auth.test': '200' };
    const written: Record<string, unknown> = {};
    const db = { collection: () => ({ doc: (id: string) => ({ id, get: async () => ({ exists: false, data: () => undefined }), set: async (d: unknown) => { written[id] = d; } }) }) } as unknown as Firestore;
    await runRegasoftApiWatch(NOW, { db, probe: probeRegasoft });
    expect((written['regasoft'] as { failures: number }).failures).toBe(0);
    void fp;
  });
});
