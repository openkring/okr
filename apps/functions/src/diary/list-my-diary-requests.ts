import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { DiaryConsent, DiarySource, DiarySourceModel, UserCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { effectiveOf, liveUsers, PullUser, readDiarySourceDocs, readPullUsers, readTenantFacts } from './diary-pull';

export interface DiaryRequest {
  tenantId: string;
  title: string;
  logoUrl: string;
  from: string;
  to: string;
  requested: DiarySource[];
  consented: DiarySource[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * What the caller's diaries want from this app (spec 1.77 §12.4). The diary app itself needs no confirmation (D-R3).
 * A confirmation is offered only with exactly one user of the person on each side, and only for that diary's owner, so
 * a new account there reads as a new request (D-R11). A consent stays listed whatever became of its diary: it must
 * always be possible to revoke it. Pure.
 */
export function buildDiaryRequests(input: {
  ownTenant: string;
  users: PullUser[];
  docs: Record<string, DiarySourceModel | undefined>;
  consents: DiaryConsent[];
  diaryTenants: Set<string>;
  configs: Record<string, Record<string, unknown> | undefined>;
}): DiaryRequest[] {
  const { ownTenant, users, docs, consents, diaryTenants, configs } = input;
  const usersIn = (tenantId: string) => users.filter((u) => u.isArchived !== true && (u.tenants ?? []).includes(tenantId));
  const tenants = [...new Set(users.filter((u) => u.isArchived !== true).flatMap((u) => u.tenants ?? []))]
    .filter((t) => t !== ownTenant && diaryTenants.has(t));

  const out: DiaryRequest[] = [];
  const add = (tenantId: string, doc: DiarySourceModel | undefined, requested: DiarySource[], consented: DiarySource[]) => {
    const cfg = configs[tenantId] ?? {};
    out.push({ tenantId, title: str(cfg['appName']) || tenantId, logoUrl: str(cfg['logoUrl']), from: doc?.from ?? '', to: doc?.to ?? '', requested, consented });
  };
  for (const tenantId of tenants) {
    const diaryUsers = usersIn(tenantId);
    const owner = diaryUsers.length === 1 ? diaryUsers[0] : undefined;
    const doc = owner ? docs[owner.id] : undefined;
    const requested = usersIn(ownTenant).length === 1 ? ((doc?.pulls ?? []).find((p) => p.tenantId === ownTenant)?.sources ?? []) : [];
    const consent = consents.find((c) => c.tenantId === tenantId);
    const consented = requested.length > 0 && consent?.uid !== owner?.id ? [] : (consent?.sources ?? []);
    if (requested.length > 0 || consented.length > 0) add(tenantId, doc, requested, consented);
  }
  for (const consent of consents) {
    if (!out.some((r) => r.tenantId === consent.tenantId)) add(consent.tenantId, undefined, [], consent.sources ?? []);
  }
  return out;
}

/** Self-scoped (spec 1.77 §12.4): the diaries asking this app. Called when the profile opens, never at boot. */
export const listMyDiaryRequests = onCall(
  { region: 'europe-west6', enforceAppCheck: true },
  async (request) => {
    const CF_NAME = 'listMyDiaryRequests';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const uid = request.auth?.uid ?? '';
    const db = getFirestore();

    const own = (await db.collection(UserCollection).doc(uid).get()).data() ?? {};
    const ownTenant = (own['tenants'] as string[] | undefined)?.[0] ?? '';
    const personKey = (own['personKey'] as string | undefined) ?? '';
    if (!personKey || !ownTenant) return { requests: [] };

    const users = await liveUsers(await readPullUsers(db, personKey));
    const tenants = [...new Set(users.flatMap((u) => u.tenants ?? []))];
    const docs = await readDiarySourceDocs(db, users);
    const consents = (own['diaryConsents'] as DiaryConsent[] | undefined) ?? [];
    const { configs, rollouts } = await readTenantFacts(db, [...new Set([...tenants, ...consents.map((c) => c.tenantId)])]);
    const requests = buildDiaryRequests({
      ownTenant, users, docs, configs, consents,
      diaryTenants: new Set(tenants.filter((t) => effectiveOf(configs, rollouts, t).has('diary'))),
    });
    logger.info(`${CF_NAME}: uid=${uid} tenant=${ownTenant} requests=[${requests.map((r) => r.tenantId).join(', ')}]`);
    return { requests };
  },
);
