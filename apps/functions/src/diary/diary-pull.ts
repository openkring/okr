//
// Spec 1.77 §12.5 — THE answer to «which diaries receive this item», for task lines, Jass lines, recordings and crew
// copies alike. A `diarySources/{uid}` doc decides for its diary tenant (pull ∩ the source user's `diaryConsents`);
// only a diary tenant without such a doc still follows the source user's `diaryTargets` (§12.6, removed in step 4).

import { getAuth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

import { pullToTarget, resolveDiaryTargets } from '@okr/content-diary-util';
import {
  AppConfigCollection, DIARY_SOURCES, DiaryConsent, DiarySource, DiarySourceModel, DiarySourcesCollection, DiaryTarget,
  FeatureRolloutCollection, UserCollection,
} from '@okr/shared-models';
import { effectiveFeatures, FEATURE_BLOCKS, type FeatureBlock, type FeatureRollout } from '@okr/tenant-util';

export type PullStatus = 'ok' | 'skipped-no-consent';

/** One diary that asked for the item. `uid` is the person's user in that diary tenant: the diary's `authorKey` (D6). */
export interface PullResult {
  tenantId: string;
  uid: string;
  status: PullStatus;
}

/** The slice of a `users/{uid}` doc the routing needs. */
export interface PullUser {
  id: string;
  tenants?: string[];
  isArchived?: boolean;
  diaryConsents?: DiaryConsent[];
  diaryTargets?: DiaryTarget[];
}

/** The person's active user doc in `diaryTenantId` — its id is the diary's `authorKey`. Pure. */
export function pickDiaryAuthor(
  users: { id: string; tenants?: string[]; isArchived?: boolean }[],
  diaryTenantId: string,
): string | undefined {
  return users.find(u => u.isArchived !== true && (u.tenants ?? []).includes(diaryTenantId))?.id;
}

/** The user doc an item's routing is read from: the first active one in the source tenant. Pure. */
export function pickSourceUser<T extends { tenants?: string[]; isArchived?: boolean }>(
  users: T[], sourceTenant: string,
): T | undefined {
  return users.find(u => u.isArchived !== true && (u.tenants ?? []).includes(sourceTenant));
}

/** The tenants of the person's active users, each once, in user order. Pure. */
function activeTenants(users: PullUser[]): string[] {
  return [...new Set(users.filter(u => u.isArchived !== true).flatMap(u => u.tenants ?? []))];
}

/**
 * The diaries that receive `source` for an item dated `date` from `sourceTenant`. Every diary needs a live user of the
 * person (active, able to log in) in a tenant with the `diary` block, and so does the source tenant (§12.2). Pure.
 */
export function selectDiaryPulls(input: {
  users: PullUser[];
  sourceTenant: string;
  source: DiarySource;
  date: string;
  docs: Record<string, DiarySourceModel | undefined>;
  diaryTenants: Set<string>;
  loginUids: Set<string>;
}): PullResult[] {
  const { users, sourceTenant, source, date, docs, diaryTenants, loginUids } = input;
  const sourceUser = pickSourceUser(users, sourceTenant);
  if (!sourceUser || !loginUids.has(sourceUser.id)) return [];

  const out: PullResult[] = [];
  for (const tenantId of activeTenants(users)) {
    const uid = pickDiaryAuthor(users, tenantId);
    if (!uid || !diaryTenants.has(tenantId) || !loginUids.has(uid)) continue;
    const reaches = (target: DiaryTarget | undefined) => resolveDiaryTargets(target ? [target] : [], source, date).length > 0;
    const doc = docs[uid];
    if (!doc) {
      const legacy = (sourceUser.diaryTargets ?? []).filter(t => t.tenantId === tenantId);
      if (resolveDiaryTargets(legacy, source, date).length > 0) out.push({ tenantId, uid, status: 'ok' });
      continue;
    }
    if (!reaches(pullToTarget(doc, tenantId, sourceTenant, [{ tenantId, sources: [...DIARY_SOURCES] }]))) continue;
    out.push({ tenantId, uid, status: reaches(pullToTarget(doc, tenantId, sourceTenant, sourceUser.diaryConsents)) ? 'ok' : 'skipped-no-consent' });
  }
  return out;
}

/** Can this uid log in? Only a missing account says no: an Auth outage must not read as «no diary». */
async function canLogIn(uid: string): Promise<boolean> {
  try {
    return (await getAuth().getUser(uid)).disabled !== true;
  } catch (error) {
    if ((error as { code?: string }).code === 'auth/user-not-found') return false;
    throw error;
  }
}

/** The `app-config` docs of these tenants and all rollouts: what `effectiveOf` needs. */
export async function readTenantFacts(db: Firestore, tenantIds: string[]): Promise<{
  configs: Record<string, Record<string, unknown> | undefined>; rollouts: FeatureRollout[];
}> {
  const [snaps, rolloutSnap] = await Promise.all([
    Promise.all(tenantIds.map(id => db.collection(AppConfigCollection).doc(id).get())),
    db.collection(FeatureRolloutCollection).get(),
  ]);
  return {
    configs: Object.fromEntries(snaps.map((s, i) => [tenantIds[i], s.data()])),
    rollouts: rolloutSnap.docs.map(d => ({ okey: d.id, ...d.data() }) as FeatureRollout),
  };
}

/** A tenant's effective feature blocks; empty without an `app-config`. Pure. */
export function effectiveOf(
  configs: Record<string, Record<string, unknown> | undefined>,
  rollouts: FeatureRollout[],
  tenantId: string,
  catalogue: FeatureBlock[] = FEATURE_BLOCKS,
): Set<string> {
  const cfg = configs[tenantId];
  if (!cfg) return new Set();
  return effectiveFeatures({ catalogue, rollouts, tenantId, enabled: cfg['enabledFeatures'] as string[] | undefined });
}

/** The `diarySources` docs of these users that exist, by uid. */
export async function readDiarySourceDocs(db: Firestore, users: PullUser[]): Promise<Record<string, DiarySourceModel | undefined>> {
  if (users.length === 0) return {};
  const snaps = await db.getAll(...users.map(u => db.collection(DiarySourcesCollection).doc(u.id)));
  const docs: Record<string, DiarySourceModel | undefined> = {};
  for (const snap of snaps) if (snap.exists) docs[snap.id] = { okey: snap.id, ...snap.data() } as DiarySourceModel;
  return docs;
}

/** All of the person's `users` docs, in the shape the routing needs. */
export async function readPullUsers(db: Firestore, personKey: string): Promise<PullUser[]> {
  const snap = await db.collection(UserCollection).where('personKey', '==', personKey).get();
  return snap.docs.map(d => ({
    id: d.id,
    tenants: d.get('tenants') as string[] | undefined,
    isArchived: d.get('isArchived') as boolean | undefined,
    diaryConsents: d.get('diaryConsents') as DiaryConsent[] | undefined,
    diaryTargets: d.get('diaryTargets') as DiaryTarget[] | undefined,
  }));
}

/** Who gets the item (see `selectDiaryPulls`). Reads tenant features and Auth only when a diary could be meant. */
export async function resolveDiaryPulls(db: Firestore, args: {
  personKey: string; sourceTenant: string; source: DiarySource; date: string;
}): Promise<PullResult[]> {
  if (!args.personKey) return [];
  const users = await readPullUsers(db, args.personKey);
  const sourceUser = pickSourceUser(users, args.sourceTenant);
  if (!sourceUser) return [];

  const docs = await readDiarySourceDocs(db, users);
  const named = new Set((sourceUser.diaryTargets ?? []).map(t => t.tenantId));
  const candidates = users.filter(u => docs[u.id] || (u.tenants ?? []).some(t => named.has(t)));
  if (candidates.length === 0) return [];

  const tenantIds = [...new Set(candidates.flatMap(u => u.tenants ?? []))];
  const { configs, rollouts } = await readTenantFacts(db, tenantIds);
  const diaryTenants = new Set(tenantIds.filter(t => effectiveOf(configs, rollouts, t).has('diary')));
  const uids = [...new Set([sourceUser.id, ...candidates.map(u => u.id)])];
  const logins = await Promise.all(uids.map(canLogIn));
  const loginUids = new Set(uids.filter((_, i) => logins[i]));
  return selectDiaryPulls({ ...args, users, docs, diaryTenants, loginUids });
}
