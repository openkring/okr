// Regasoft API watch (spec 1.133 §4.7, decision D14). Regasoft is not trusted to keep its API
// stable or to announce changes, so a job on the morning scheduler fingerprints the API once a
// month and creates a task for the SRV responsible person when anything changed. The passive half,
// `checkShape` on every sync, lives in shape-check.ts and is re-exported here.
//
// The fingerprint holds names, types, counts and status codes — never a field value, so the state
// document `integration-health/regasoft` holds no member data. It is written only by this function
// (Admin SDK); firestore.rules has no entry for it, so clients are denied by default.
//
// 1.133 §4.7 optional round trip: PUT the test record back unchanged and compare. Not built — off
// by default (spec §8); build it only when someone switches it on.
import { DocumentData, Firestore, getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { TaskCollection, TaskModel } from '@okr/shared-models';
import { addDuration } from '@okr/shared-util-core';
import { getTaskIndex } from '@okr/project-task-util';

import { regasoftHeaders } from '../_gateway/adapters/srv';
import { gatewayFetch } from '../_gateway/http';
import { responsibilityAssignee } from '../member-fee/exit-settlement.context';
import { mergeTaskNotes } from '../member-fee/exit-settlement.trigger';
import { withoutUndefined } from '../invoice/invoice.logic';
import { SYSTEM_AUTHOR } from '../workflow/activity';
import { isRegasoftTestSystem, REGASOFT_SYSTEM, regasoftBaseUrl } from './shared';
import { toStoreDate } from './zurich-time';

export { checkShape, resetShapeCheck } from './shape-check';

const STATE_COLLECTION = 'integration-health';
const STATE_DOC = 'regasoft';
const TASK_TENANT = 'scs';
const RESPONSIBILITY_KEY = 'scs-srv';
const TASK_ID_PREFIX = 'regasoft-api-watch-';
const DUE_IN_DAYS = 14;
/** How many `-2`, `-3` … suffixes a month's task key may take before the run gives up. */
const MAX_TASK_SUFFIX = 20;
/**
 * Task states that close a review. Not `TERMINAL_TASK_STATES` from @okr/project-task-util: that
 * list also holds the parking state `later`, and parking a task must not accept a changed API.
 */
const CLOSED_TASK_STATES: readonly string[] = ['done', 'cancelled'];
/** Bruno's own record on the test system: the detail probe. */
const PROBE_RID = 26183;
/**
 * The announced parameter probes may return the detail shape for every member, licence images
 * included. They only have to tell «same as the plain list» from «different», so they are capped
 * low: a response over the cap is itself a change (`changes:oversize`), it is never retried.
 */
const PARAM_MAX_BYTES = 2 * 1024 * 1024;
const DOCS_REFERENCE = 'planning/reference/REGASOFT.md';

/** The usual Swagger / OpenAPI paths (REGASOFT.md «Doc discovery»); an API doc appearing is a change. */
export const DOC_PATHS = [
  '/swagger', '/swagger/index.html', '/swagger/v1/swagger.json', '/swagger/v2/swagger.json', '/swagger/docs/v1',
  '/swagger/ui/index', '/swagger.json', '/api/swagger.json', '/api/openapi.json', '/openapi.json', '/openapi/v1.json',
  '/api-docs', '/api/docs', '/docs', '/redoc', '/scalar', '/help', '/api/help', '/api',
] as const;

/** Flat `key → description` map of the API's observable shape. */
export type ApiFingerprint = Record<string, string>;

export interface FingerprintDiff { key: string; before: string; after: string }

/** Marks a side probe that threw (timeout, reset): a stable fingerprint value, not a failed run. */
export const PROBE_ERROR = Symbol('probe-error');
/** Marks a parameter probe whose response exceeded the size cap: it surely differs from the plain list. */
export const PARAM_OVERSIZE = Symbol('param-oversize');

export interface ApiProbe {
  listStatus: number;
  list: unknown;
  /** PROBE_ERROR when the request failed */
  detail: unknown;
  /** undefined when the parameter probe could not be completed; PARAM_OVERSIZE over the size cap */
  listAll: unknown;
  listInactive: unknown;
  err401: unknown;
  err400: unknown;
  err401Status?: number;
  err400Status?: number;
  /** status per doc path; 'error' when the request failed */
  docs: Record<string, number | 'error'>;
}

// --- fingerprint (pure) ---------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function typeOf(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  return Array.isArray(v) ? 'array' : typeof v;
}

/** `name:type` per field, types of all records merged and sorted (`null` last), fields sorted. */
function describeFields(records: Record<string, unknown>[]): string {
  if (records.length === 0) return 'none';
  const types = new Map<string, Set<string>>();
  for (const r of records) {
    for (const [k, v] of Object.entries(r)) {
      const set = types.get(k) ?? new Set<string>();
      set.add(typeOf(v));
      types.set(k, set);
    }
  }
  const rank = (t: string) => (t === 'null' ? 1 : 0);
  return [...types.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, set]) => `${k}:${[...set].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1)).join('|')}`).join(',');
}

const envelopeOf = (raw: unknown): string => (isRecord(raw) ? Object.keys(raw).sort().join(',') : Array.isArray(raw) ? 'array' : typeOf(raw));
const dataOf = (raw: unknown): unknown => (isRecord(raw) && 'data' in raw ? raw['data'] : raw);
const listOf = (raw: unknown): Record<string, unknown>[] => {
  const d = dataOf(raw);
  return Array.isArray(d) ? d.filter(isRecord) : [];
};
const recordOf = (raw: unknown): Record<string, unknown>[] => {
  const d = dataOf(raw);
  return isRecord(d) ? [d] : [];
};

/**
 * 'ignored' = same fields and count as the plain list; 'changes' = it differs; 'changes:oversize' =
 * the response was over the size cap (a stable value, reported like any change); 'unavailable' =
 * the probe failed (transient).
 */
function paramEffect(plain: unknown, withParam: unknown): string {
  if (withParam === undefined) return 'unavailable';
  if (withParam === PARAM_OVERSIZE) return 'changes:oversize';
  const a = listOf(plain);
  const b = listOf(withParam);
  return a.length === b.length && describeFields(a) === describeFields(b) ? 'ignored' : 'changes';
}

/** Names, types and status codes only — never a value. `system` names the auth key (`auth.test`). */
export function buildFingerprint(probe: ApiProbe, system: 'test' | 'production' = 'test'): ApiFingerprint {
  const failed = (v: unknown): boolean => v === PROBE_ERROR;
  const detail = failed(probe.detail) ? [] : recordOf(probe.detail);
  const clubs = detail.flatMap(d => (Array.isArray(d['personClubs']) ? (d['personClubs'] as unknown[]).filter(isRecord) : []));
  const fp: ApiFingerprint = {
    [`auth.${system}`]: String(probe.listStatus),
    'list.envelope': envelopeOf(probe.list),
    'list.fields': describeFields(listOf(probe.list)),
    'detail.envelope': failed(probe.detail) ? 'error' : envelopeOf(probe.detail),
    'detail.fields': failed(probe.detail) ? 'error' : describeFields(detail),
    'detail.personClubs': failed(probe.detail) ? 'error' : describeFields(clubs),
    'param.all': paramEffect(probe.list, probe.listAll),
    'param.inactive': paramEffect(probe.list, probe.listInactive),
    'error.401': failed(probe.err401) ? 'error' : envelopeOf(probe.err401),
    'error.400': failed(probe.err400) ? 'error' : envelopeOf(probe.err400),
  };
  if (probe.err401Status !== undefined) fp['error.401.status'] = String(probe.err401Status);
  if (probe.err400Status !== undefined) fp['error.400.status'] = String(probe.err400Status);
  for (const [path, status] of Object.entries(probe.docs)) fp[`docs.${path}`] = String(status);
  return fp;
}

/** Every key whose value differs, sorted by key; a key on one side only has '' on the other. */
export function diffFingerprint(a: ApiFingerprint, b: ApiFingerprint): FingerprintDiff[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
    .filter(key => (a[key] ?? '') !== (b[key] ?? ''))
    .map(key => ({ key, before: a[key] ?? '', after: b[key] ?? '' }));
}

/** Fingerprint values that mean «the probe failed this time», not «the API changed». */
const TRANSIENT_MARKERS = new Set(['error', 'unavailable']);

/**
 * Replace what a failed probe could not measure with the accepted value, so a timeout never reads as
 * an API change and a marker never reaches `pending` or `accepted`. A marker (or the status key of
 * a failed error probe) with no accepted value is left out.
 */
export function carryForward(accepted: ApiFingerprint, fp: ApiFingerprint): ApiFingerprint {
  const out: ApiFingerprint = {};
  for (const [key, value] of Object.entries(fp)) {
    const statusOfFailedProbe = /^error\.\d+\.status$/.test(key) && fp[key.replace(/\.status$/, '')] === 'error';
    if (TRANSIENT_MARKERS.has(value) || statusOfFailedProbe) {
      if (key in accepted) out[key] = accepted[key];
    } else out[key] = value;
  }
  // a status key left out because its probe failed is carried too
  for (const key of Object.keys(accepted)) {
    if (/^error\.\d+\.status$/.test(key) && !(key in fp) && fp[key.replace(/\.status$/, '')] === 'error') out[key] = accepted[key];
  }
  return out;
}

// --- the state machine (pure) -----------------------------------------------------------------

export interface WatchState {
  /** the last fingerprint someone has looked at */
  accepted: ApiFingerprint;
  /** the changed fingerprint a task is open for; null = nothing to review */
  pending: ApiFingerprint | null;
  /** the task of the current review (document id in `tasks`) */
  taskKey: string;
  /** yyyymm of the last run that reached Regasoft */
  lastRunMonth: string;
  /** consecutive runs that could not reach Regasoft */
  failures: number;
}

export type ProbeResult = { reachable: false } | { reachable: true; fingerprint: ApiFingerprint };
/** The task named by `state.taskKey`: not there, open, or done / archived. */
export type TaskStatus = 'none' | 'open' | 'done';
export type TaskReason = 'changed' | 'auth' | 'unreachable';

export interface TaskAction { op: 'create' | 'update'; key: string; reason: TaskReason; diff: FingerprintDiff[] }
export interface WatchDecision { state: WatchState; task: TaskAction | null }

const EMPTY_STATE: WatchState = { accepted: {}, pending: null, taskKey: '', lastRunMonth: '', failures: 0 };
const UNREACHABLE_BEFORE_TASK = 2;

export const watchMonth = (now: Date): string => toStoreDate(now).substring(0, 6);
export const watchTaskKey = (month: string): string => `${TASK_ID_PREFIX}${month}`;
const authRejected = (fp: ApiFingerprint): boolean => Object.entries(fp).some(([k, v]) => k.startsWith('auth.') && v !== '200');

/**
 * What one daily run does. A done task promotes `pending` to `accepted` on any day (no Regasoft
 * call needed); the probe itself happens once per month, or again the next day after a run that
 * could not reach Regasoft. An open task is updated in place, a new one is created otherwise.
 */
export function decideWatch(prev: WatchState | undefined, probe: ProbeResult, task: TaskStatus, now: Date): WatchDecision {
  let state: WatchState = { ...EMPTY_STATE, ...prev };
  const month = watchMonth(now);
  if (state.pending && task === 'done') state = { ...state, accepted: state.pending, pending: null };
  if (state.lastRunMonth >= month) return { state, task: null };

  const key = task === 'open' && state.taskKey ? state.taskKey : watchTaskKey(month);
  const op: TaskAction['op'] = task === 'open' ? 'update' : 'create';

  if (!probe.reachable) {
    const failures = state.failures + 1;
    if (failures < UNREACHABLE_BEFORE_TASK) return { state: { ...state, failures }, task: null };
    // a task is already open for it: nothing new to say
    if (task === 'open') return { state: { ...state, failures }, task: null };
    return { state: { ...state, failures, taskKey: key }, task: { op, key, reason: 'unreachable', diff: [] } };
  }

  const fp = carryForward(state.accepted, probe.fingerprint);
  const reached: WatchState = { ...state, failures: 0, lastRunMonth: month };
  if (authRejected(fp)) {
    // a failed login needs no comparison; the fingerprint of a rejected call is no baseline
    return { state: { ...reached, taskKey: key }, task: { op, key, reason: 'auth', diff: diffFingerprint(state.accepted, fp).filter(d => d.key.startsWith('auth.')) } };
  }
  if (Object.keys(state.accepted).length === 0) return { state: { ...reached, accepted: fp, pending: null }, task: null };

  const diff = diffFingerprint(state.accepted, fp);
  if (diff.length === 0) {
    return { state: { ...reached, pending: null }, task: task === 'open' ? { op: 'update', key, reason: 'changed', diff } : null };
  }
  return { state: { ...reached, pending: fp, taskKey: key }, task: { op, key, reason: 'changed', diff } };
}

// --- task text (German: the reader is the SRV responsible person) -----------------------------

const show = (v: string): string => (v === '' ? '(nicht vorhanden)' : v);

export function watchTaskName(reason: TaskReason): string {
  switch (reason) {
    case 'auth': return 'Regasoft: Anmeldung abgelehnt';
    case 'unreachable': return 'Regasoft: nicht erreichbar';
    default: return 'Regasoft: Schnittstelle hat sich geändert';
  }
}

export function watchTaskNotes(action: Pick<TaskAction, 'reason' | 'diff'>, system: string): string {
  const intro = {
    changed: action.diff.length === 0
      ? `Regasoft (${system}): Die Schnittstelle entspricht wieder dem zuletzt geprüften Stand.`
      : `Regasoft (${system}): Die monatliche Prüfung hat Änderungen an der Schnittstelle gefunden.`,
    auth: `Regasoft (${system}): Die Anmeldung wurde abgelehnt. Schlüssel oder Zugang prüfen.`,
    unreachable: `Regasoft (${system}): Die Schnittstelle war an mehreren Tagen nacheinander nicht erreichbar.`,
  }[action.reason];
  const lines = action.diff.map(d => `- ${d.key}: vorher ${show(d.before)}, jetzt ${show(d.after)}`);
  return [intro, ...lines, `Siehe ${DOCS_REFERENCE}. Aufgabe erledigen, sobald die Änderung geprüft ist: der neue Stand gilt dann als bekannt.`].join('\n');
}

// --- I/O ------------------------------------------------------------------------------------------

export interface WatchIo { db: Firestore; probe: () => Promise<ProbeResult> }

const system = (): 'test' | 'production' => (REGASOFT_SYSTEM === 'test' ? 'test' : 'production');
const get = (url: string, headers: Record<string, string>, limits: { maxBytes?: number; maxRetries?: number } = {}) =>
  gatewayFetch(url, { method: 'GET', headers, validateStatus: () => true, timeoutMs: 15_000, maxRetries: limits.maxRetries ?? 1, ...(limits.maxBytes ? { maxBytes: limits.maxBytes } : {}) });

/** axios rejects a response over `maxContentLength` with this message (no status: it would be retried). */
const isOversize = (e: unknown): boolean => e instanceof Error && /maxContentLength size of \d+ exceeded/.test(e.message);

/** A side probe: a request that throws is recorded as PROBE_ERROR, it never fails the run. */
async function side(name: string, url: string, headers: Record<string, string>): Promise<{ status: number; data: unknown } | typeof PROBE_ERROR> {
  try {
    const r = await get(url, headers);
    return { status: r.status, data: r.data };
  } catch (e: unknown) {
    // the probe's name only: no URL with ids, no response data
    logger.warn(`regasoftApiWatch: side probe ${name} failed`, { error: e instanceof Error ? e.message : String(e) });
    return PROBE_ERROR;
  }
}

/**
 * Run all probes against the configured Regasoft system. Only the member list decides whether
 * Regasoft is reachable (a throw or a 5xx); every side probe (detail, error shapes, doc paths,
 * parameters) is caught on its own and shows up in the fingerprint as 'error' / 'unavailable'.
 */
export async function probeRegasoft(): Promise<ProbeResult> {
  const base = regasoftBaseUrl();
  const headers = regasoftHeaders();
  let list: { status: number; data: unknown };
  try {
    list = await get(`${base}/api/club/members`, headers);
  } catch (e: unknown) {
    logger.warn('regasoftApiWatch: Regasoft not reachable', { error: e instanceof Error ? e.message : String(e) });
    return { reachable: false };
  }
  if (list.status >= 500) return { reachable: false };
  /** A parameter probe: its data, PARAM_OVERSIZE over the cap, undefined when it failed. No retry. */
  const optional = async (query: string): Promise<unknown> => {
    try {
      const r = await get(`${base}/api/club/members${query}`, headers, { maxBytes: PARAM_MAX_BYTES, maxRetries: 0 });
      return r.status === 200 ? r.data : undefined;
    } catch (e: unknown) {
      if (isOversize(e)) return PARAM_OVERSIZE;
      logger.warn(`regasoftApiWatch: side probe param${query} failed`, { error: e instanceof Error ? e.message : String(e) });
      return undefined;
    }
  };
  const [detail, err401, err400, docs] = await Promise.all([
    side('detail', `${base}/api/club/members/${PROBE_RID}`, headers),
    side('err401', `${base}/api/club/members`, { ...headers, ApiKey: 'invalid' }),
    side('err400', `${base}/api/club/members/schema`, headers),
    Promise.all(DOC_PATHS.map(async p => {
      const r = await side(`docs${p}`, `${base}${p}`, {});
      return [p, r === PROBE_ERROR ? 'error' : r.status] as const;
    })),
  ]);
  // The two parameter probes may be large: one after the other, never alongside each other.
  const listAll = await optional('?all=true');
  const listInactive = await optional('?inactive=true');
  const probe: ApiProbe = {
    listStatus: list.status, list: list.data, listAll, listInactive, docs: Object.fromEntries(docs),
    detail: detail === PROBE_ERROR ? PROBE_ERROR : detail.data,
    err401: err401 === PROBE_ERROR ? PROBE_ERROR : err401.data,
    err400: err400 === PROBE_ERROR ? PROBE_ERROR : err400.data,
    ...(err401 !== PROBE_ERROR ? { err401Status: err401.status } : {}),
    ...(err400 !== PROBE_ERROR ? { err400Status: err400.status } : {}),
  };
  return { reachable: true, fingerprint: buildFingerprint(probe, system()) };
}

const liveIo = (): WatchIo => ({ db: getFirestore(), probe: probeRegasoft });

function taskStatusOf(data: DocumentData | undefined): TaskStatus {
  if (!data) return 'none';
  const closed = CLOSED_TASK_STATES.includes(String(data['state'])) || data['isArchived'] === true
    || (typeof data['completionDate'] === 'string' && data['completionDate'] !== '');
  return closed ? 'done' : 'open';
}

/**
 * Where a new task goes without overwriting anything: the first of `key`, `key-2`, `key-3` … that
 * no task has. A closed task is skipped (its history stays); an open one is updated in place.
 */
export async function resolveCreateKey(key: string, statusOf: (key: string) => Promise<TaskStatus>): Promise<{ key: string; op: TaskAction['op'] }> {
  for (let n = 1; n <= MAX_TASK_SUFFIX; n++) {
    const candidate = n === 1 ? key : `${key}-${n}`;
    const status = await statusOf(candidate);
    if (status === 'none') return { key: candidate, op: 'create' };
    if (status === 'open') return { key: candidate, op: 'update' };
  }
  throw new Error(`regasoftApiWatch: no free task key up to ${key}-${MAX_TASK_SUFFIX}`);
}

/** Writes the task and returns the key it was written under (a create may move to a suffixed key). */
async function writeTask(db: Firestore, action: TaskAction, today: string): Promise<string> {
  const tasks = db.collection(TaskCollection);
  const target = action.op === 'create'
    ? await resolveCreateKey(action.key, async k => taskStatusOf((await tasks.doc(k).get()).data()))
    : { key: action.key, op: action.op };
  const ref = tasks.doc(target.key);
  const name = watchTaskName(action.reason);
  const generated = watchTaskNotes(action, isRegasoftTestSystem() ? 'Testsystem' : 'Produktion');
  if (target.op === 'update') {
    const found = (await ref.get()).data();
    const notes = mergeTaskNotes(typeof found?.['notes'] === 'string' ? (found['notes'] as string) : undefined, generated);
    await ref.update({ name, notes, index: getTaskIndex({ ...(found as TaskModel), name, notes }) });
    return target.key;
  }
  const task = new TaskModel(TASK_TENANT);
  task.name = name;
  task.notes = mergeTaskNotes(undefined, generated);
  task.author = SYSTEM_AUTHOR;
  task.assignee = await responsibilityAssignee(db, RESPONSIBILITY_KEY, today);
  task.dueDate = addDuration(today, { days: DUE_IN_DAYS });
  task.index = getTaskIndex(task);
  const { okey, ...doc } = task; // okey is the document id, never a field
  void okey;
  await ref.create(withoutUndefined(doc));   // never overwrites: fails if the key was taken meanwhile
  return target.key;
}

/**
 * The morning job: promote an accepted change, probe Regasoft when the month is due, and write
 * the state and the task. Cheap on the days it has nothing to do (one state read, no Regasoft call).
 */
export async function runRegasoftApiWatch(now: Date = new Date(), io: WatchIo = liveIo()): Promise<void> {
  const { db } = io;
  const stateRef = db.collection(STATE_COLLECTION).doc(STATE_DOC);
  const prev = (await stateRef.get()).data() as WatchState | undefined;
  const effective: WatchState = { ...EMPTY_STATE, ...prev };
  const taskData = effective.taskKey ? (await db.collection(TaskCollection).doc(effective.taskKey).get()).data() : undefined;
  const status = taskStatusOf(taskData);

  // Regasoft is only called when the month is due (after a possible promotion by a done task)
  const promoted = decideWatch(prev, { reachable: false }, status, now);
  const due = promoted.state.lastRunMonth < watchMonth(now);
  const probe: ProbeResult = due ? await io.probe() : { reachable: false };
  const decision = due ? decideWatch(prev, probe, status, now) : promoted;

  let state = decision.state;
  if (decision.task) {
    const key = await writeTask(db, decision.task, toStoreDate(now));
    if (key !== state.taskKey) state = { ...state, taskKey: key };
  }
  if (JSON.stringify(state) !== JSON.stringify(prev ?? null)) await stateRef.set(state);
  logger.info(`regasoftApiWatch: ${due ? (probe.reachable ? 'probed' : 'unreachable') : 'not due'}, task ${decision.task ? `${decision.task.op} ${decision.task.reason}` : 'none'}`);
}
